// Merge an open-things server database into another server (e.g. when moving to a
// new server). Each record is sent with its original updatedAt, so the receiving
// server keeps whichever version is newer; nothing newer is ever overwritten.
//
//   node tools/push-db.ts <path/to/open-things.sqlite> <server-url> <token>
import { DatabaseSync } from 'node:sqlite';

const [dbPath, server, token] = process.argv.slice(2);
if (!dbPath || !server || !token) {
  console.error('usage: node tools/push-db.ts <open-things.sqlite> <server-url> <token>');
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare('SELECT id, type, data, updatedAt FROM records').all() as { id: string; type: string; data: string; updatedAt: number }[];
const changes = rows.map((r) => ({ id: r.id, type: r.type, updatedAt: r.updatedAt, data: JSON.parse(r.data) }));

const res = await fetch(`${server.replace(/\/+$/, '')}/api/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ since: Number.MAX_SAFE_INTEGER, changes }),
});
if (!res.ok) {
  console.error(`merge failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const body = (await res.json()) as { applied: number };
console.log(`Sent ${rows.length} records; ${body.applied} were newer and applied.`);
