// open-things sync server: zero-dependency Node 24 (node:http + node:sqlite).
// Stores every record (task/area/tag) as JSON with a monotonically increasing
// `seq`. Clients push dirty records and pull everything newer than their last seq.
// Conflict rule: last-write-wins per record, by `updatedAt`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.OPEN_THINGS_TOKEN ?? '';
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? '../web/dist');
const TYPES = new Set(['task', 'area', 'tag']);

if (TOKEN.length < 16) {
  console.error('OPEN_THINGS_TOKEN must be set (min 16 chars)');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'open-things.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS records (
    id        TEXT PRIMARY KEY,
    type      TEXT NOT NULL,
    data      TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    seq       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS records_seq ON records(seq);
`);

const qGet = db.prepare('SELECT id, type, data, updatedAt, seq FROM records WHERE id = ?');
const qSince = db.prepare('SELECT id, type, data, updatedAt, seq FROM records WHERE seq > ? ORDER BY seq');
const qUpsert = db.prepare(`
  INSERT INTO records (id, type, data, updatedAt, seq) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data,
    updatedAt = excluded.updatedAt, seq = excluded.seq`);
let seq = Number((db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').get() as { s: number }).s);

type Row = { id: string; type: string; data: string; updatedAt: number; seq: number };
type Change = { id: string; type: string; updatedAt: number; data: Record<string, unknown> };

const toChange = (r: Row) => ({ id: r.id, type: r.type, updatedAt: r.updatedAt, seq: r.seq, data: JSON.parse(r.data) });

function applySync(since: number, changes: Change[]) {
  let applied = 0;
  const rejected: Row[] = [];
  db.exec('BEGIN');
  try {
    for (const c of changes) {
      if (typeof c?.id !== 'string' || !TYPES.has(c.type) || typeof c.updatedAt !== 'number') continue;
      const cur = qGet.get(c.id) as Row | undefined;
      if (cur && cur.updatedAt > c.updatedAt) {
        rejected.push(cur); // client is stale: send it the winning version
        continue;
      }
      qUpsert.run(c.id, c.type, JSON.stringify({ ...c.data, id: c.id, updatedAt: c.updatedAt }), c.updatedAt, ++seq);
      applied++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const rows = qSince.all(since) as Row[];
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rejected) if (!ids.has(r.id)) rows.push(r);
  return { applied, seq, changes: rows.map(toChange) };
}

// --- Server-Sent Events: tell connected clients to pull when data changes ---
const listeners = new Set<http.ServerResponse>();
function broadcast() {
  for (const res of listeners) res.write(`data: ${seq}\n\n`);
}
setInterval(() => { for (const res of listeners) res.write(': ping\n\n'); }, 25_000);

function authorized(req: http.IncomingMessage, url: URL) {
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('token') ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJson(req: http.IncomingMessage, limit = 20 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.zip': 'application/zip', '.apk': 'application/vnd.android.package-archive',
};

const DOWNLOADS: Record<string, { file: string; type: string }> = {
  '/open-things.apk': { file: 'open-things.apk', type: MIME['.apk'] },
  '/OpenThings.dmg': { file: 'OpenThings.dmg', type: 'application/x-apple-diskimage' },
};

function serveStatic(res: http.ServerResponse, pathname: string) {
  // App installers live in DATA_DIR so web rebuilds don't wipe them.
  const download = DOWNLOADS[pathname];
  if (download) {
    const file = path.join(DATA_DIR, download.file);
    if (!fs.existsSync(file)) return json(res, 404, { error: `${download.file} not uploaded` });
    res.writeHead(200, {
      'content-type': download.type,
      'cache-control': 'no-cache',
      'content-length': fs.statSync(file).size,
      'content-disposition': `attachment; filename="${download.file}"`,
    });
    return void fs.createReadStream(file).pipe(res);
  }
  if (pathname === '/version.json' || pathname === '/bundle.zip') console.log(`update ${pathname}`);
  let file = path.resolve(STATIC_DIR, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(STATIC_DIR)) return json(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(file)) return json(res, 404, { error: 'web app not built' });
  const ext = path.extname(file);
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // CORS so native wrappers (Capacitor/Tauri) on other origins can sync.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, seq });

    if (url.pathname.startsWith('/api/')) {
      if (!authorized(req, url)) return json(res, 401, { error: 'unauthorized' });

      if (url.pathname === '/api/sync' && req.method === 'POST') {
        const body = await readJson(req);
        const result = applySync(Number(body.since) || 0, Array.isArray(body.changes) ? body.changes : []);
        if (result.applied > 0) broadcast();
        console.log(`sync ${req.socket.remoteAddress} since=${body.since} pushed=${result.applied} pulled=${result.changes.length}`);
        return json(res, 200, result);
      }

      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`data: ${seq}\n\n`);
        listeners.add(res);
        req.on('close', () => listeners.delete(res));
        return;
      }
      return json(res, 404, { error: 'not found' });
    }

    if (req.method === 'GET') return serveStatic(res, url.pathname);
    json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    json(res, 400, { error: String((e as Error).message ?? e) });
  }
});

server.listen(PORT, () => console.log(`open-things server on :${PORT} (data: ${DATA_DIR})`));
