// Local-first store (IndexedDB via Dexie). Mirrors Things' TMTask/TMArea/TMTag model:
// a single `tasks` table holds to-dos, projects and headings (Things `type` 0/1/2).
import Dexie, { type Table } from 'dexie';

export type Status = 'open' | 'done' | 'canceled';
export type Start = 'inbox' | 'anytime' | 'someday'; // Things `start` 0/1/2

export interface Base {
  id: string;
  updatedAt: number;
  deleted?: boolean; // tombstone (kept so the deletion syncs)
  dirty?: 0 | 1; // local change not yet pushed
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface Task extends Base {
  kind: 'todo' | 'project' | 'heading';
  title: string;
  notes: string;
  status: Status;
  completedAt: number | null;
  start: Start;
  startDate: string | null; // YYYY-MM-DD; future date => Upcoming
  evening: boolean; // Things `startBucket` = 1
  deadline: string | null;
  areaId: string | null;
  projectId: string | null;
  headingId: string | null;
  tagIds: string[];
  checklist: ChecklistItem[];
  index: number;
  trashed: boolean;
  createdAt: number;
  // Repeating (Things: rt1_recurrenceRule / rt1_repeatingTemplate). A template is a
  // hidden task holding the rule; instances are normal tasks pointing at it.
  repeat?: RepeatRule | null;
  templateId?: string | null;
  occurrence?: string | null; // instance's scheduled date per the rule (YYYY-MM-DD)
  ghost?: boolean; // UI only: projected future occurrence, never stored
}

export interface RepeatRule {
  type: 'schedule' | 'afterCompletion';
  unit: 'day' | 'week' | 'month' | 'year';
  every: number;
  weekdays?: number[]; // week: 0 = Sunday … 6 = Saturday
  monthMode?: 'day' | 'weekday';
  monthDay?: number; // 1…31, -1 = last day
  ordinal?: number; // 1…4, -1 = last (monthMode 'weekday')
  weekday?: number; // 0…6 (monthMode 'weekday')
  start: string; // first occurrence / anchor (YYYY-MM-DD)
  endDate?: string | null;
  count?: number | null;
  deadlineDays?: number | null; // each copy gets deadline = occurrence + N days
}

export interface Area extends Base {
  title: string;
  index: number;
}

export interface Tag extends Base {
  title: string;
  index: number;
}

class OpenThingsDB extends Dexie {
  tasks!: Table<Task, string>;
  areas!: Table<Area, string>;
  tags!: Table<Tag, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('open-things');
    this.version(1).stores({
      tasks: 'id, kind, projectId, areaId, dirty',
      areas: 'id, dirty',
      tags: 'id, dirty',
      meta: 'key',
    });
  }
}

export const db = new OpenThingsDB();

export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

let onLocalChange = () => {};
export function setOnLocalChange(fn: () => void) {
  onLocalChange = fn;
}
export const notifyLocalChange = () => onLocalChange();

const stamp = () => ({ updatedAt: Date.now(), dirty: 1 as const });

export async function createTask(fields: Partial<Task>): Promise<string> {
  const now = Date.now();
  const task: Task = {
    id: uid(),
    kind: 'todo',
    title: '',
    notes: '',
    status: 'open',
    completedAt: null,
    start: 'inbox',
    startDate: null,
    evening: false,
    deadline: null,
    areaId: null,
    projectId: null,
    headingId: null,
    tagIds: [],
    checklist: [],
    index: now,
    trashed: false,
    createdAt: now,
    ...fields,
    ...stamp(),
  };
  await db.tasks.add(task);
  onLocalChange();
  return task.id;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  await db.tasks.update(id, { ...patch, ...stamp() });
  onLocalChange();
}

export async function updateTasks(ids: string[], patch: Partial<Task>) {
  await db.transaction('rw', db.tasks, async () => {
    for (const id of ids) await db.tasks.update(id, { ...patch, ...stamp() });
  });
  onLocalChange();
}

export async function createArea(title: string) {
  const id = uid();
  await db.areas.add({ id, title, index: Date.now(), ...stamp() });
  onLocalChange();
  return id;
}

export async function updateArea(id: string, patch: Partial<Area>) {
  await db.areas.update(id, { ...patch, ...stamp() });
  onLocalChange();
}

export async function createTag(title: string) {
  const id = uid();
  await db.tags.add({ id, title, index: Date.now(), ...stamp() });
  onLocalChange();
  return id;
}
