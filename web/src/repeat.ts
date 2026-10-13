// Repeating to-dos and projects, modelled on Things' RecurrenceRule
// (type: fixed schedule or after completion; unit + amount; weekday/day-of-month
// offsets; start, end date, repeat count).
//
// A template is a hidden task with `repeat`. Instances are ordinary tasks with
// `templateId` + `occurrence`. Instances are generated from data alone (no
// template mutation) with deterministic ids, so two devices generating the same
// copy converge instead of duplicating. Generated records use updatedAt = 1 so
// any real edit (and the server's existing copy) always wins over regeneration.
import { db, uid, notifyLocalChange, type Task, type RepeatRule } from './db';
import { addDays, fmt, parse, todayStr } from './dates';

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function nthWeekday(y: number, m: number, ordinal: number, weekday: number): Date | null {
  if (ordinal === -1) {
    const last = new Date(y, m, daysIn(y, m));
    return new Date(y, m, last.getDate() - ((last.getDay() - weekday + 7) % 7));
  }
  const day = 1 + ((weekday - new Date(y, m, 1).getDay() + 7) % 7) + (ordinal - 1) * 7;
  return day > daysIn(y, m) ? null : new Date(y, m, day);
}

/** All scheduled occurrence dates of a rule, ascending (respects end date and count). */
export function* occurrences(rule: RepeatRule): Generator<string> {
  const s = parse(rule.start);
  const [sy, sm, sd] = [s.getFullYear(), s.getMonth(), s.getDate()];
  const every = Math.max(1, Math.floor(rule.every) || 1);
  let n = 0;
  for (let k = 0; k < 50_000; k++) {
    let dates: Date[] = [];
    switch (rule.unit) {
      case 'day':
        dates = [new Date(sy, sm, sd + k * every)];
        break;
      case 'week': {
        const weekStart = sd - s.getDay() + k * 7 * every;
        const wds = rule.weekdays?.length ? [...rule.weekdays].sort() : [s.getDay()];
        dates = wds.map((w) => new Date(sy, sm, weekStart + w));
        break;
      }
      case 'month': {
        const y = sy + Math.floor((sm + k * every) / 12);
        const m = (sm + k * every) % 12;
        const d =
          rule.monthMode === 'weekday'
            ? nthWeekday(y, m, rule.ordinal ?? 1, rule.weekday ?? s.getDay())
            : new Date(y, m, rule.monthDay === -1 ? daysIn(y, m) : Math.min(rule.monthDay ?? sd, daysIn(y, m)));
        dates = d ? [d] : [];
        break;
      }
      case 'year': {
        const y = sy + k * every;
        dates = [new Date(y, sm, Math.min(sd, daysIn(y, sm)))];
        break;
      }
    }
    for (const d of dates) {
      const str = fmt(d);
      if (str < rule.start) continue;
      if (rule.endDate && str > rule.endDate) return;
      if (rule.count && n >= rule.count) return;
      n++;
      yield str;
    }
  }
}

/** Most recent scheduled occurrence on or before `day`. */
export function latestDue(rule: RepeatRule, day: string) {
  let last: string | null = null;
  for (const d of occurrences(rule)) {
    if (d > day) break;
    last = d;
  }
  return last;
}

/** Scheduled occurrences in (after, until], at most `limit`. */
export function occurrencesBetween(rule: RepeatRule, after: string, until: string, limit = 10) {
  const out: string[] = [];
  for (const d of occurrences(rule)) {
    if (d > until || out.length >= limit) break;
    if (d > after) out.push(d);
  }
  return out;
}

export function addInterval(day: string, rule: RepeatRule) {
  const d = parse(day);
  const e = Math.max(1, Math.floor(rule.every) || 1);
  const [y, m, dd] = [d.getFullYear(), d.getMonth(), d.getDate()];
  switch (rule.unit) {
    case 'day': return fmt(new Date(y, m, dd + e));
    case 'week': return fmt(new Date(y, m, dd + 7 * e));
    case 'month': {
      const ny = y + Math.floor((m + e) / 12), nm = (m + e) % 12;
      return fmt(new Date(ny, nm, Math.min(dd, daysIn(ny, nm))));
    }
    case 'year': return fmt(new Date(y + e, m, Math.min(dd, daysIn(y + e, m))));
  }
}

export function defaultRule(unit: RepeatRule['unit'], start: string, afterCompletion = false): RepeatRule {
  const s = parse(start);
  const day = s.getDate();
  return {
    type: afterCompletion ? 'afterCompletion' : 'schedule',
    unit,
    every: 1,
    weekdays: [s.getDay()],
    monthMode: 'day',
    monthDay: day,
    ordinal: day + 7 > daysIn(s.getFullYear(), s.getMonth()) ? -1 : Math.ceil(day / 7),
    weekday: s.getDay(),
    start,
    endDate: null,
    count: null,
    deadlineDays: null,
  };
}

// --- Description -------------------------------------------------------------

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ordinalLabel = (n: number) =>
  n === -1 ? 'last' : n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export function describe(rule: RepeatRule) {
  const e = Math.max(1, rule.every);
  const unit = e === 1 ? rule.unit : `${e} ${rule.unit}s`;
  let text: string;
  if (rule.type === 'afterCompletion') {
    text = `${e === 1 ? `1 ${rule.unit}` : unit} after completion`;
  } else {
    text = e === 1 ? (rule.unit === 'day' ? 'Every day' : `Every ${rule.unit}`) : `Every ${unit}`;
    if (rule.unit === 'week') {
      const wds = [...(rule.weekdays ?? [])].sort();
      const key = wds.join();
      text += key === '1,2,3,4,5' ? ' on weekdays' : key === '0,6' ? ' on weekends' : ` on ${wds.map((w) => WEEKDAYS[w]).join(', ')}`;
    } else if (rule.unit === 'month') {
      text +=
        rule.monthMode === 'weekday'
          ? ` on the ${ordinalLabel(rule.ordinal ?? 1)} ${LONG_WEEKDAYS[rule.weekday ?? 0]}`
          : rule.monthDay === -1
            ? ' on the last day'
            : ` on the ${ordinalLabel(rule.monthDay ?? 1)}`;
    } else if (rule.unit === 'year') {
      text += ` on ${parse(rule.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
  }
  if (rule.endDate) text += `, until ${parse(rule.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  if (rule.count) text += `, ${rule.count} times`;
  return text;
}

// --- Instances ---------------------------------------------------------------

/** Instance (and, for projects, its child to-dos/headings) for one occurrence. */
function instantiate(tpl: Task, id: string, occurrence: string, all: Task[]): Task[] {
  const now = Date.now();
  const rule = tpl.repeat!;
  const copy = (src: Task, fields: Partial<Task>): Task => ({
    ...src,
    status: 'open',
    completedAt: null,
    checklist: src.checklist.map((c) => ({ ...c, done: false })),
    tagIds: [...src.tagIds],
    trashed: false,
    deleted: false,
    createdAt: now,
    updatedAt: 1,
    dirty: 1,
    repeat: null,
    templateId: null,
    occurrence: null,
    ...fields,
  });
  const suffix = id.slice(tpl.id.length); // ":2026-10-13" or ":#3"
  const out = [
    copy(tpl, {
      id,
      start: 'anytime',
      startDate: occurrence,
      deadline: rule.deadlineDays != null ? addDays(occurrence, rule.deadlineDays) : null,
      index: now,
      templateId: tpl.id,
      occurrence,
    }),
  ];
  if (tpl.kind === 'project') {
    for (const c of all) {
      if (c.projectId !== tpl.id || c.trashed || c.deleted) continue;
      out.push(copy(c, {
        id: c.id + suffix,
        projectId: id,
        headingId: c.headingId ? c.headingId + suffix : null,
        start: 'anytime',
        startDate: null,
      }));
    }
  }
  return out;
}

let running = false;

/** Create any due instances. Safe to call often and on several devices at once. */
export async function runRepeats() {
  if (running) return;
  running = true;
  try {
    const today = todayStr();
    const all = await db.tasks.toArray();
    const instancesOf = new Map<string, Task[]>();
    for (const t of all) if (t.templateId) instancesOf.set(t.templateId, [...(instancesOf.get(t.templateId) ?? []), t]);

    const toAdd: Task[] = [];
    for (const tpl of all) {
      const rule = tpl.repeat;
      if (!rule || tpl.trashed || tpl.deleted || tpl.status !== 'open') continue;
      const inst = instancesOf.get(tpl.id) ?? [];

      if (rule.type === 'schedule') {
        const maxOcc = inst.reduce((m, t) => (t.occurrence && t.occurrence > m ? t.occurrence : m), '');
        const due = latestDue(rule, today);
        if (due && due > maxOcc) toAdd.push(...instantiate(tpl, `${tpl.id}:${due}`, due, all));
        continue;
      }

      // After completion: one open copy at a time; next = completion date + interval.
      if (inst.some((t) => t.status === 'open' && !t.trashed && !t.deleted)) continue;
      if (rule.count && inst.length >= rule.count) continue;
      let next = rule.start;
      if (inst.length) {
        const last = inst.reduce((a, b) => ((a.occurrence ?? '') >= (b.occurrence ?? '') ? a : b));
        next = addInterval(fmt(new Date(last.completedAt ?? last.updatedAt)), rule);
      }
      if (rule.endDate && next > rule.endDate) continue;
      toAdd.push(...instantiate(tpl, `${tpl.id}:#${inst.length + 1}`, next, all));
    }

    const fresh: Task[] = [];
    for (const t of toAdd) if (!(await db.tasks.get(t.id))) fresh.push(t); // incl. tombstones
    if (fresh.length) {
      await db.tasks.bulkAdd(fresh);
      notifyLocalChange();
    }
  } finally {
    running = false;
  }
}

/**
 * Turn an existing to-do/project into a repeating one: a new hidden template is
 * created from it, and the task itself becomes the first instance.
 */
export async function makeRepeating(t: Task, rule: RepeatRule, all: Task[]) {
  const now = Date.now();
  const tplId = uid();
  const stamp = { updatedAt: now, dirty: 1 as const };
  const template: Task = {
    ...t,
    id: tplId,
    repeat: rule,
    templateId: null,
    occurrence: null,
    status: 'open',
    completedAt: null,
    start: 'anytime',
    startDate: null,
    evening: false,
    deadline: null,
    checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })),
    createdAt: now,
    ...stamp,
  };
  const rows: Task[] = [template];
  if (t.kind === 'project') {
    const headingMap = new Map<string, string>();
    const children = all.filter((c) => c.projectId === t.id && !c.trashed && !c.deleted && (c.kind === 'heading' || c.status === 'open'));
    for (const h of children.filter((c) => c.kind === 'heading')) headingMap.set(h.id, uid());
    for (const c of children) {
      rows.push({
        ...c,
        id: c.kind === 'heading' ? headingMap.get(c.id)! : uid(),
        projectId: tplId,
        headingId: c.headingId ? headingMap.get(c.headingId) ?? null : null,
        startDate: null,
        checklist: c.checklist.map((i) => ({ ...i, done: false })),
        createdAt: now,
        ...stamp,
      });
    }
  }
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.bulkAdd(rows);
    await db.tasks.update(t.id, { templateId: tplId, occurrence: rule.start, start: 'anytime', startDate: rule.start, ...stamp });
  });
  notifyLocalChange();
  await runRepeats();
}

/** Stop repeating: the template (and its child template to-dos) go to Trash; copies stay. */
export async function stopRepeating(templateId: string, all: Task[]) {
  const now = Date.now();
  const ids = [templateId, ...all.filter((c) => c.projectId === templateId).map((c) => c.id)];
  await db.transaction('rw', db.tasks, async () => {
    for (const id of ids) await db.tasks.update(id, { trashed: true, updatedAt: now, dirty: 1 });
  });
  notifyLocalChange();
}
