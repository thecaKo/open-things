// Pure list logic (no UI): which tasks appear where, mirroring Things' lists.
import type { Task, Area, Tag } from './db';
import { addDays, dayLabel, fmt, parse } from './dates';
import { occurrencesBetween } from './repeat';

export type ListKind = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook' | 'trash';
export type View = { kind: 'home' } | { kind: ListKind } | { kind: 'project'; id: string } | { kind: 'area'; id: string };

export const LISTS: { kind: ListKind; label: string }[] = [
  { kind: 'inbox', label: 'Inbox' },
  { kind: 'today', label: 'Today' },
  { kind: 'upcoming', label: 'Upcoming' },
  { kind: 'anytime', label: 'Anytime' },
  { kind: 'someday', label: 'Someday' },
  { kind: 'logbook', label: 'Logbook' },
  { kind: 'trash', label: 'Trash' },
];

export interface Ctx {
  tasks: Task[]; // excludes repeating templates and their child to-dos
  all: Task[]; // every non-deleted task, templates included
  templates: Task[]; // active repeating templates
  byId: Map<string, Task>;
  areas: Area[];
  projects: Task[];
  tags: Tag[];
  tagById: Map<string, Tag>;
  today: string;
}

export interface Section {
  key: string;
  title?: string;
  date?: string; // Upcoming/Logbook day sections render the day number
  evening?: boolean;
  heading?: Task;
  items: Task[];
  defaults?: Partial<Task>;
}

export interface ViewModel {
  title: string;
  sections: Section[];
  defaults?: Partial<Task>; // where "+" creates a to-do; absent = no "+"
  empty?: string;
  project?: Task;
  area?: Area;
}

export const alive = (t: Task) => !t.deleted && !t.trashed;
export const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;

// --- Completed items linger briefly, then animate out to the Logbook ----------
const lingering = new Set<string>();
let lingerVersion = 0;
const lingerSubs = new Set<() => void>();
export function markCompleted(id: string) {
  lingering.add(id);
  setTimeout(() => {
    lingering.delete(id);
    lingerVersion++;
    lingerSubs.forEach((fn) => fn());
  }, 1300);
}
export const subscribeLinger = (fn: () => void) => (lingerSubs.add(fn), () => void lingerSubs.delete(fn));
export const getLingerVersion = () => lingerVersion;
export const shown = (t: Task) => t.status === 'open' || lingering.has(t.id);

export const inToday = (t: Task, today: string) =>
  (!!t.startDate && t.startDate <= today) || (!!t.deadline && t.deadline <= today && t.status === 'open');

function parentActive(t: Task, ctx: Ctx) {
  if (!t.projectId) return true;
  const p = ctx.byId.get(t.projectId);
  return !!p && alive(p) && p.status === 'open' && p.start !== 'someday' && !(p.startDate && p.startDate > ctx.today);
}

/** Scheduled/deadline items show in Today even inside a Someday project (like Things). */
function parentOpen(t: Task, ctx: Ctx) {
  if (!t.projectId) return true;
  const p = ctx.byId.get(t.projectId);
  return !!p && alive(p) && p.status === 'open';
}

export function buildCtx(tasks: Task[], areas: Area[], tags: Tag[], today: string): Ctx {
  const all = tasks.filter((t) => !t.deleted);
  const byId = new Map(all.map((t) => [t.id, t]));
  const isTemplatePart = (t: Task) => !!t.repeat || (!!t.projectId && !!byId.get(t.projectId)?.repeat);
  const live = all.filter((t) => !isTemplatePart(t));
  return {
    tasks: live,
    all,
    templates: all.filter((t) => t.repeat && alive(t) && t.status === 'open').sort(byIndex),
    byId,
    areas: areas.filter((a) => !a.deleted).sort(byIndex),
    projects: live.filter((t) => t.kind === 'project' && alive(t) && t.status === 'open').sort(byIndex),
    tags: tags.filter((t) => !t.deleted).sort((a, b) => a.title.localeCompare(b.title)),
    tagById: new Map(tags.map((t) => [t.id, t])),
    today,
  };
}

const openTodos = (ctx: Ctx) => ctx.tasks.filter((t) => t.kind === 'todo' && alive(t) && t.status === 'open');
const isInbox = (t: Task) => t.start === 'inbox' && !t.startDate && !t.projectId && !t.areaId;

export function counts(ctx: Ctx) {
  const open = openTodos(ctx);
  return {
    inbox: open.filter(isInbox).length,
    today: open.filter((t) => inToday(t, ctx.today) && parentOpen(t, ctx)).length,
  };
}

export function projectProgress(p: Task, ctx: Ctx) {
  const items = ctx.all.filter((t) => t.projectId === p.id && t.kind === 'todo' && alive(t));
  return items.length ? items.filter((t) => t.status !== 'open').length / items.length : 0;
}

export function buildView(view: View, ctx: Ctx): ViewModel {
  const { today } = ctx;
  const todos = ctx.tasks.filter((t) => t.kind === 'todo' && alive(t));
  const title = LISTS.find((l) => l.kind === view.kind)?.label ?? '';

  switch (view.kind) {
    case 'home':
      return { title: 'Lists', sections: [] };
    case 'inbox':
      return {
        title,
        sections: [{ key: 'i', items: todos.filter((t) => shown(t) && isInbox(t)).sort(byIndex) }],
        defaults: { start: 'inbox' },
        empty: 'Your Inbox is empty.',
      };
    case 'today': {
      const items = todos.filter((t) => shown(t) && inToday(t, today) && parentOpen(t, ctx)).sort(byIndex);
      const evening = items.filter((t) => t.evening);
      return {
        title,
        sections: [
          { key: 'd', items: items.filter((t) => !t.evening) },
          ...(evening.length ? [{ key: 'e', title: 'This Evening', evening: true, items: evening }] : []),
        ],
        defaults: { start: 'anytime', startDate: today },
        empty: 'Nothing planned for today.',
      };
    }
    case 'upcoming': {
      const future = ctx.tasks.filter((t) => t.kind !== 'heading' && alive(t) && t.status === 'open' && t.startDate && t.startDate > today);
      // Projected copies of fixed-schedule repeating items (not created until their day).
      const horizon = addDays(today, 60);
      const ghosts = ctx.templates
        .filter((tpl) => tpl.repeat!.type === 'schedule')
        .flatMap((tpl) => {
          const made = new Set(ctx.all.filter((t) => t.templateId === tpl.id).map((t) => t.occurrence));
          return occurrencesBetween(tpl.repeat!, today, horizon, 8)
            .filter((d) => !made.has(d))
            .map((d): Task => ({ ...tpl, id: `ghost:${tpl.id}:${d}`, startDate: d, templateId: tpl.id, repeat: null, ghost: true }));
        });
      const items = [...future, ...ghosts];
      const days = [...new Set(items.map((t) => t.startDate!))].sort();
      return {
        title,
        sections: [
          ...days.map((d) => ({ key: d, date: d, title: upcomingLabel(d, today), items: items.filter((t) => t.startDate === d).sort(byIndex) })),
          ...(ctx.templates.length ? [{ key: 'repeating', title: 'Repeating', items: ctx.templates }] : []),
        ],
        defaults: { start: 'anytime', startDate: addDays(today, 1) },
        empty: 'Nothing scheduled.',
      };
    }
    case 'anytime': {
      const items = todos.filter((t) => shown(t) && t.start === 'anytime' && !(t.startDate && t.startDate > today) && parentActive(t, ctx));
      const groups = new Map<string, Task[]>();
      for (const t of items) {
        const key = t.projectId ?? t.areaId ?? '';
        groups.set(key, [...(groups.get(key) ?? []), t]);
      }
      const sections: Section[] = [...groups.entries()].map(([key, ts]) => ({
        key: key || 'none',
        title: key ? (ctx.byId.get(key)?.title ?? ctx.areas.find((a) => a.id === key)?.title ?? '') : undefined,
        items: ts.sort(byIndex),
      }));
      sections.sort((a, b) => (a.title ? 1 : 0) - (b.title ? 1 : 0));
      return { title, sections, defaults: { start: 'anytime' } };
    }
    case 'someday':
      return {
        title,
        sections: [{
          key: 's',
          items: ctx.tasks
            .filter((t) => t.kind !== 'heading' && alive(t) && shown(t) && t.start === 'someday' && !t.startDate && (t.kind === 'project' || parentActive(t, ctx)))
            .sort(byIndex),
        }],
        defaults: { start: 'someday' },
      };
    case 'logbook': {
      const done = ctx.tasks
        .filter((t) => t.kind !== 'heading' && alive(t) && t.status !== 'open')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      const days = [...new Set(done.map((t) => fmt(new Date(t.completedAt ?? 0))))];
      return {
        title,
        sections: days.map((d) => ({ key: d, date: d, title: dayLabel(d), items: done.filter((t) => fmt(new Date(t.completedAt ?? 0)) === d) })),
        empty: 'No completed items yet.',
      };
    }
    case 'trash': {
      const trashed = ctx.all.filter((t) => t.trashed && t.kind !== 'heading' && !(t.projectId && ctx.byId.get(t.projectId)?.trashed));
      return { title, sections: [{ key: 't', items: trashed.sort((a, b) => b.updatedAt - a.updatedAt) }], empty: 'Trash is empty.' };
    }
    case 'project': {
      const p = ctx.byId.get(view.id);
      if (!p || p.deleted) return { title: 'Project not found', sections: [] };
      const children = ctx.all.filter((t) => t.projectId === p.id && (p.trashed || !t.trashed));
      const items = children.filter((t) => t.kind === 'todo');
      const headings = children.filter((t) => t.kind === 'heading').sort(byIndex);
      const visible = (t: Task) => shown(t) && t.kind === 'todo';
      const start = p.start === 'someday' ? 'someday' : 'anytime';
      return {
        title: p.title,
        project: p,
        sections: [
          { key: 'root', items: items.filter((t) => visible(t) && !t.headingId).sort(byIndex) },
          ...headings.map((h) => ({
            key: h.id,
            heading: h,
            items: items.filter((t) => visible(t) && t.headingId === h.id).sort(byIndex),
            defaults: { projectId: p.id, headingId: h.id, start } as Partial<Task>,
          })),
        ],
        defaults: { projectId: p.id, start },
        empty: 'No to-dos yet.',
      };
    }
    case 'area': {
      const a = ctx.areas.find((x) => x.id === view.id);
      if (!a) return { title: 'Area not found', sections: [] };
      return {
        title: a.title,
        area: a,
        sections: [
          { key: 'todos', items: todos.filter((t) => shown(t) && t.areaId === a.id && !t.projectId).sort(byIndex) },
          { key: 'projects', title: 'Projects', items: ctx.projects.filter((p) => p.areaId === a.id) },
        ].filter((s) => s.key === 'todos' || s.items.length),
        defaults: { areaId: a.id, start: 'anytime' },
      };
    }
  }
}

/** The list a task lives in (Quick Find jumps there). */
export function listOf(t: Task, ctx: Ctx): View {
  if (t.kind === 'project') return { kind: 'project', id: t.id };
  if (t.trashed) return { kind: 'trash' };
  if (t.status !== 'open') return { kind: 'logbook' };
  if (t.projectId) return { kind: 'project', id: t.projectId };
  if (t.areaId) return { kind: 'area', id: t.areaId };
  if (t.startDate) return { kind: t.startDate <= ctx.today ? 'today' : 'upcoming' };
  if (t.start === 'inbox') return { kind: 'inbox' };
  return { kind: t.start === 'someday' ? 'someday' : 'anytime' };
}

export function search(ctx: Ctx, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return { lists: [], tasks: [] };
  const lists: { view: View; label: string }[] = [
    ...LISTS.filter((l) => l.label.toLowerCase().includes(s)).map((l) => ({ view: { kind: l.kind } as View, label: l.label })),
    ...ctx.areas.filter((a) => a.title.toLowerCase().includes(s)).map((a) => ({ view: { kind: 'area', id: a.id } as View, label: a.title })),
  ];
  const tagIds = new Set(ctx.tags.filter((t) => t.title.toLowerCase().includes(s)).map((t) => t.id));
  const tasks = ctx.tasks
    .filter((t) => t.kind !== 'heading' && !t.deleted && !t.trashed &&
      (t.title.toLowerCase().includes(s) || t.notes.toLowerCase().includes(s) || t.tagIds.some((id) => tagIds.has(id))))
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.updatedAt - a.updatedAt)
    .slice(0, 50);
  return { lists, tasks };
}

export const dayNumber = (d: string) => parse(d).getDate();

/** Things' Upcoming header next to the big day number: "Tomorrow", "Friday", "Friday · Nov". */
function upcomingLabel(d: string, today: string) {
  if (d === addDays(today, 1)) return 'Tomorrow';
  const date = parse(d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.getMonth() === parse(today).getMonth() ? weekday : `${weekday} · ${date.toLocaleDateString(undefined, { month: 'short' })}`;
}
