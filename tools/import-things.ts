// Import a Things 3 database into an open-things server.
//
//   node tools/import-things.ts <server-url> <token> [path/to/main.sqlite]
//
// Reads the Things DB read-only (default: the Mac app's live DB location; quit
// Things first or point at a copy). Mapping, from the TMTask schema:
//   type   0 to-do | 1 project | 2 heading
//   status 0 open  | 2 canceled | 3 completed
//   start  0 inbox | 1 anytime | 2 someday
//   startBucket 1 = This Evening
//   startDate/deadline: packed int  (year << 16) | (month << 12) | (day << 7)
// Repeating templates (rows with rt1_recurrenceRule) are skipped, along with
// their child to-dos: the rule is a binary plist (keys fu/fa/of/sr/ed/rc/tp/rrv,
// seen in ThingsModel) whose unit encoding hasn't been verified against real data.
// Copies already created by Things are imported as normal to-dos.
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const [server, token, dbArg] = process.argv.slice(2);
if (!server || !token) {
  console.error('usage: node tools/import-things.ts <server-url> <token> [main.sqlite]');
  process.exit(1);
}

function defaultDbPath() {
  const group = path.join(os.homedir(), 'Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac');
  const dir = fs.readdirSync(group).find((d) => d.startsWith('ThingsData-'));
  if (!dir) throw new Error('Things database not found');
  return path.join(group, dir, 'Things Database.thingsdatabase/main.sqlite');
}

const db = new DatabaseSync(dbArg ?? defaultDbPath(), { readOnly: true });
const all = (sql: string) => db.prepare(sql).all() as any[];

const date = (v: number | null) => {
  if (!v) return null;
  const y = v >> 16, m = (v >> 12) & 0xf, d = (v >> 7) & 0x1f;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const ms = (secs: number | null) => (secs ? Math.round(secs * 1000) : null);
const now = Date.now();

const tagsByTask = new Map<string, string[]>();
for (const r of all('SELECT tasks, tags FROM TMTaskTag')) tagsByTask.set(r.tasks, [...(tagsByTask.get(r.tasks) ?? []), r.tags]);

const checklistByTask = new Map<string, { id: string; title: string; done: boolean }[]>();
for (const r of all('SELECT uuid, title, status, task FROM TMChecklistItem ORDER BY "index"')) {
  checklistByTask.set(r.task, [...(checklistByTask.get(r.task) ?? []), { id: r.uuid, title: r.title ?? '', done: r.status !== 0 }]);
}

const allRows = all('SELECT * FROM TMTask');
const templateIds = new Set(allRows.filter((r) => r.rt1_recurrenceRule != null).map((r) => r.uuid));
const rows = allRows.filter((r) => !templateIds.has(r.uuid) && !templateIds.has(r.project));
const projectOfHeading = new Map(rows.filter((r) => r.type === 2).map((r) => [r.uuid, r.project]));

const changes: { id: string; type: string; updatedAt: number; data: Record<string, unknown> }[] = [];

for (const a of all('SELECT * FROM TMArea')) {
  changes.push({ id: a.uuid, type: 'area', updatedAt: now, data: { id: a.uuid, title: a.title ?? '', index: a.index ?? 0, updatedAt: now } });
}
for (const t of all('SELECT * FROM TMTag')) {
  changes.push({ id: t.uuid, type: 'tag', updatedAt: now, data: { id: t.uuid, title: t.title ?? '', index: t.index ?? 0, updatedAt: now } });
}
for (const r of rows) {
  const projectId = r.project ?? (r.heading ? projectOfHeading.get(r.heading) ?? null : null);
  const task = {
    id: r.uuid,
    kind: (['todo', 'project', 'heading'] as const)[r.type] ?? 'todo',
    title: r.title ?? '',
    notes: r.notes ?? '',
    status: r.status === 3 ? 'done' : r.status === 2 ? 'canceled' : 'open',
    completedAt: r.status ? ms(r.stopDate) : null,
    start: (['inbox', 'anytime', 'someday'] as const)[r.start] ?? 'anytime',
    startDate: date(r.startDate),
    evening: r.startBucket === 1,
    deadline: date(r.deadline),
    areaId: r.area ?? null,
    projectId,
    headingId: r.heading ?? null,
    tagIds: tagsByTask.get(r.uuid) ?? [],
    checklist: checklistByTask.get(r.uuid) ?? [],
    index: r.index ?? 0,
    trashed: !!r.trashed,
    createdAt: ms(r.creationDate) ?? now,
    updatedAt: now,
  };
  changes.push({ id: r.uuid, type: 'task', updatedAt: now, data: task });
}

const res = await fetch(`${server.replace(/\/+$/, '')}/api/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ since: Number.MAX_SAFE_INTEGER, changes }),
});
if (!res.ok) {
  console.error(`import failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const body = (await res.json()) as { applied: number };
console.log(`Imported ${body.applied} records (${rows.length} tasks/projects/headings).`);
if (templateIds.size) console.log(`Skipped ${templateIds.size} repeating template(s): recreate their rules in Open Things.`);
