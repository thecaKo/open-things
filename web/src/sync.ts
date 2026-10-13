// Sync engine: push dirty records, pull everything after our last server seq.
// Triggers: local edits (debounced), server push (SSE), focus/online, and a timer.
import { db, setOnLocalChange, type Base } from './db';

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

const TABLES = { task: db.tasks, area: db.areas, tag: db.tags } as const;
type RecordType = keyof typeof TABLES;

// Snapshot must be referentially stable for useSyncExternalStore.
let snapshot: { state: SyncState; lastError: string } = { state: 'local', lastError: '' };
const subscribers = new Set<() => void>();
function setState(state: SyncState, lastError = '') {
  if (snapshot.state === state && snapshot.lastError === lastError) return;
  snapshot = { state, lastError };
  subscribers.forEach((fn) => fn());
}
export const getSyncState = () => snapshot;
export function subscribeSync(fn: () => void) {
  subscribers.add(fn);
  return () => void subscribers.delete(fn);
}

export interface SyncConfig {
  url: string; // '' = same origin as the web app
  token: string;
}

export async function getConfig(): Promise<SyncConfig> {
  const row = await db.meta.get('config');
  return (row?.value as SyncConfig) ?? { url: '', token: '' };
}

export async function setConfig(cfg: SyncConfig) {
  await db.meta.put({ key: 'config', value: { url: cfg.url.replace(/\/+$/, ''), token: cfg.token.trim() } });
  await db.meta.delete('seq'); // new server: pull everything again
  connectEvents();
  void syncNow();
}

let running = false;
let again = false;
export async function syncNow() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await syncOnce();
    } while (again);
  } finally {
    running = false;
  }
}

async function syncOnce() {
  const { url, token } = await getConfig();
  if (!token) return setState('local');
  if (!navigator.onLine) return setState('offline');
  setState('syncing');

  const since = ((await db.meta.get('seq'))?.value as number) ?? 0;
  const changes: { id: string; type: RecordType; updatedAt: number; data: Omit<Base, 'dirty'> }[] = [];
  for (const [type, table] of Object.entries(TABLES) as [RecordType, (typeof TABLES)[RecordType]][]) {
    const dirty = (await table.where('dirty').equals(1).toArray()) as Base[];
    for (const { dirty: _d, ...data } of dirty) changes.push({ id: data.id, type, updatedAt: data.updatedAt, data });
  }

  let body: { seq: number; changes: { id: string; type: string; updatedAt: number; data: Base }[] };
  try {
    const res = await fetch(`${url}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ since, changes }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'Invalid token' : `HTTP ${res.status}`);
    body = await res.json();
  } catch (e) {
    return setState(navigator.onLine ? 'error' : 'offline', String((e as Error).message ?? e));
  }

  await db.transaction('rw', [db.tasks, db.areas, db.tags, db.meta], async () => {
    // Clear dirty flag only if the record wasn't edited again while we were syncing.
    for (const c of changes) {
      const table = TABLES[c.type];
      const cur = (await table.get(c.id)) as Base | undefined;
      if (cur && cur.updatedAt === c.updatedAt) await table.update(c.id, { dirty: 0 });
    }
    for (const r of body.changes) {
      const table = TABLES[r.type as RecordType];
      if (!table) continue;
      const cur = (await table.get(r.id)) as Base | undefined;
      if (cur && cur.updatedAt > r.updatedAt) continue; // local is newer; will be pushed
      await table.put({ ...r.data, dirty: 0 } as never);
    }
    await db.meta.put({ key: 'seq', value: body.seq });
  });
  setState('synced');
}

let debounce: ReturnType<typeof setTimeout> | undefined;
let events: EventSource | undefined;

async function connectEvents() {
  events?.close();
  events = undefined;
  const { url, token } = await getConfig();
  if (!token) return;
  events = new EventSource(`${url}/api/events?token=${encodeURIComponent(token)}`);
  events.onmessage = () => void syncNow();
}

export function startSync() {
  setOnLocalChange(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 400);
  });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('focus', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => void syncNow(), 60_000);
  void connectEvents();
  void syncNow();
}
