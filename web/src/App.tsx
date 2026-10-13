import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, createTask, updateTask, updateTasks, createArea, updateArea, createTag, uid,
  type Task, type Area, type Tag,
} from './db';
import { getSyncState, subscribeSync, syncNow, getConfig, setConfig } from './sync';
import { todayStr, addDays, isToday, dayLabel, daysLeft, fmt } from './dates';
import { APP_VERSION, isNative, getPendingUpdate, getUpdateStatus, subscribeUpdate, applyUpdate, checkForUpdate } from './update';

type ListKind = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook' | 'trash';
type View = { kind: ListKind } | { kind: 'project'; id: string } | { kind: 'area'; id: string };

interface Ctx {
  tasks: Task[];
  byId: Map<string, Task>;
  areas: Area[];
  projects: Task[];
  tags: Tag[];
  tagById: Map<string, Tag>;
  today: string;
  open: (v: View) => void;
}

interface Section {
  key: string;
  title?: string;
  heading?: Task;
  items: Task[];
  defaults?: Partial<Task>;
}

const LISTS: { kind: ListKind; label: string; icon: string; color: string }[] = [
  { kind: 'inbox', label: 'Inbox', icon: '⬇', color: '#3b82f6' },
  { kind: 'today', label: 'Today', icon: '★', color: '#f5b400' },
  { kind: 'upcoming', label: 'Upcoming', icon: '▦', color: '#e5484d' },
  { kind: 'anytime', label: 'Anytime', icon: '≋', color: '#14a3a3' },
  { kind: 'someday', label: 'Someday', icon: '▢', color: '#b59a6a' },
  { kind: 'logbook', label: 'Logbook', icon: '✓', color: '#30a46c' },
  { kind: 'trash', label: 'Trash', icon: '⌫', color: '#8b8d98' },
];

const alive = (t: Task) => !t.deleted && !t.trashed;
const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;
/** Completed items stay visible (struck through) for the rest of the day, like Things. */
const shown = (t: Task) => t.status === 'open' || isToday(t.completedAt);

function parentActive(t: Task, ctx: Ctx) {
  if (!t.projectId) return true;
  const p = ctx.byId.get(t.projectId);
  return !!p && alive(p) && p.status === 'open' && p.start !== 'someday' && !(p.startDate && p.startDate > ctx.today);
}

const inToday = (t: Task, today: string) =>
  (!!t.startDate && t.startDate <= today) || (!!t.deadline && t.deadline <= today && t.status === 'open');

// ---------------------------------------------------------------------------

export default function App() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? [];
  const areas = useLiveQuery(() => db.areas.toArray(), []) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? [];
  const [view, setView] = useState<View>(() => JSON.parse(localStorage.getItem('view') ?? '{"kind":"today"}'));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [today, setToday] = useState(todayStr());

  // Native app has no same-origin server: ask for the setup link on first launch.
  useEffect(() => {
    if (isNative) void getConfig().then((c) => !c.token && setSettings(true));
  }, []);

  useEffect(() => {
    const tick = () => setToday(todayStr());
    const id = setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(id); window.removeEventListener('focus', tick); };
  }, []);

  const open = (v: View) => {
    setView(v);
    setExpanded(null);
    setMenu(false);
    localStorage.setItem('view', JSON.stringify(v));
  };

  const ctx: Ctx = useMemo(() => {
    const live = tasks.filter((t) => !t.deleted);
    return {
      tasks: live,
      byId: new Map(live.map((t) => [t.id, t])),
      areas: areas.filter((a) => !a.deleted).sort(byIndex),
      projects: live.filter((t) => t.kind === 'project' && alive(t) && t.status === 'open').sort(byIndex),
      tags: tags.filter((t) => !t.deleted).sort((a, b) => a.title.localeCompare(b.title)),
      tagById: new Map(tags.map((t) => [t.id, t])),
      today,
      open,
    };
  }, [tasks, areas, tags, today]);

  // Keyboard: "n" new to-do, Escape closes the editor.
  const newTodoRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if (e.key === 'Escape') setExpanded(null);
      else if (!typing && (e.key === 'n' || e.key === ' ') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        newTodoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const model = buildView(view, ctx);
  const add = async (defaults: Partial<Task> = model.defaults ?? {}) => setExpanded(await createTask(defaults));
  newTodoRef.current = () => model.defaults && add();

  return (
    <div className={'app' + (menu ? ' menu-open' : '')}>
      <Sidebar view={view} ctx={ctx} onSettings={() => setSettings(true)} />
      <div className="scrim" onClick={() => setMenu(false)} />
      <main className="main">
        <header className="main-header">
          <button className="menu-btn" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
          {model.icon && <span className="list-icon" style={{ color: model.color }}>{model.icon}</span>}
          {model.titleNode ?? <h1>{model.title}</h1>}
          <div className="spacer" />
          {model.actions}
        </header>
        {model.header}
        <div className="list">
          {model.sections.map((s) => (
            <div className="section" key={s.key}>
              {s.heading ? (
                <HeadingRow h={s.heading} onAdd={() => add(s.defaults)} />
              ) : (
                s.title && <h2 className="section-title">{s.title}</h2>
              )}
              {s.items.map((t) =>
                t.kind === 'project' ? (
                  <ProjectRow key={t.id} p={t} ctx={ctx} />
                ) : (
                  <TaskRow
                    key={t.id}
                    t={t}
                    ctx={ctx}
                    view={view}
                    expanded={expanded === t.id}
                    onExpand={(id) => setExpanded(id)}
                  />
                ),
              )}
            </div>
          ))}
          {model.sections.every((s) => s.items.length === 0 && !s.heading) && (
            <div className="empty">{model.empty ?? 'Nothing here.'}</div>
          )}
        </div>
        {model.defaults && (
          <button className="fab" onClick={() => add()} title="New To-Do (n)">＋</button>
        )}
      </main>
      {settings && <Settings onClose={() => setSettings(false)} />}
      <UpdateBanner />
    </div>
  );
}

function UpdateStatus() {
  const s = useSyncExternalStore(subscribeUpdate, getUpdateStatus);
  if (!s.checkedAt) return <p className="muted">Update: not checked yet</p>;
  return (
    <p className="muted">
      Update checked {new Date(s.checkedAt).toLocaleTimeString()}
      {s.latest && ` · server has ${s.latest}`}
      {s.error && ` · error: ${s.error}`}
    </p>
  );
}

function UpdateBanner() {
  const pending = useSyncExternalStore(subscribeUpdate, getPendingUpdate);
  if (!pending) return null;
  return (
    <button className="update-banner" onClick={() => void applyUpdate()}>
      New version available. Tap to update.
    </button>
  );
}

// --- View model ------------------------------------------------------------

interface ViewModel {
  title: string;
  titleNode?: ReactNode;
  icon?: string;
  color?: string;
  sections: Section[];
  defaults?: Partial<Task>;
  header?: ReactNode;
  actions?: ReactNode;
  empty?: string;
}

function buildView(view: View, ctx: Ctx): ViewModel {
  const { today } = ctx;
  const todos = ctx.tasks.filter((t) => t.kind === 'todo' && alive(t));
  const list = LISTS.find((l) => l.kind === view.kind);
  const base = { title: list?.label ?? '', icon: list?.icon, color: list?.color };

  switch (view.kind) {
    case 'inbox':
      return {
        ...base,
        sections: [{ key: 'i', items: todos.filter((t) => shown(t) && t.start === 'inbox' && !t.startDate && !t.projectId && !t.areaId).sort(byIndex) }],
        defaults: { start: 'inbox' },
      };
    case 'today': {
      const items = todos.filter((t) => shown(t) && inToday(t, today) && parentActiveOrScheduled(t, ctx)).sort(byIndex);
      return {
        ...base,
        sections: ([
          { key: 'd', items: items.filter((t) => !t.evening) },
          { key: 'e', title: 'This Evening', items: items.filter((t) => t.evening) },
        ] as Section[]).filter((s) => s.key === 'd' || s.items.length),
        defaults: { start: 'anytime', startDate: today },
      };
    }
    case 'upcoming': {
      const future = ctx.tasks.filter((t) => t.kind !== 'heading' && alive(t) && t.status === 'open' && t.startDate && t.startDate > today);
      const days = [...new Set(future.map((t) => t.startDate!))].sort();
      return {
        ...base,
        sections: days.map((d) => ({ key: d, title: dayLabel(d), items: future.filter((t) => t.startDate === d).sort(byIndex) })),
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
      const sections = [...groups.entries()].map(([key, ts]) => ({
        key: key || 'none',
        title: key ? (ctx.byId.get(key)?.title ?? ctx.areas.find((a) => a.id === key)?.title ?? '') : undefined,
        items: ts.sort(byIndex),
      }));
      sections.sort((a, b) => (a.title ? 1 : 0) - (b.title ? 1 : 0));
      return { ...base, sections, defaults: { start: 'anytime' } };
    }
    case 'someday':
      return {
        ...base,
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
        ...base,
        sections: days.map((d) => ({ key: d, title: dayLabel(d), items: done.filter((t) => fmt(new Date(t.completedAt ?? 0)) === d) })),
        empty: 'No completed items yet.',
      };
    }
    case 'trash': {
      const trashed = ctx.tasks.filter((t) => t.trashed && t.kind !== 'heading');
      return {
        ...base,
        sections: [{ key: 't', items: trashed.sort((a, b) => b.updatedAt - a.updatedAt) }],
        actions: trashed.length > 0 && (
          <button className="btn" onClick={() => confirm('Permanently delete all items in Trash?') && updateTasks(ctx.tasks.filter((t) => t.trashed).map((t) => t.id), { deleted: true })}>
            Empty Trash
          </button>
        ),
        empty: 'Trash is empty.',
      };
    }
    case 'project': {
      const p = ctx.byId.get(view.id);
      if (!p || p.deleted) return { title: 'Project not found', sections: [] };
      const children = ctx.tasks.filter((t) => t.projectId === p.id && !t.deleted && (p.trashed || !t.trashed));
      const items = children.filter((t) => t.kind === 'todo');
      const headings = children.filter((t) => t.kind === 'heading').sort(byIndex);
      const visible = (t: Task) => shown(t) && t.kind === 'todo';
      const total = items.length;
      const doneCount = items.filter((t) => t.status !== 'open').length;
      const start = p.start === 'someday' ? 'someday' : 'anytime';
      return {
        title: p.title,
        titleNode: <ProjectTitle p={p} done={doneCount} total={total} />,
        header: <ProjectHeader p={p} ctx={ctx} items={items} headings={headings} />,
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
        titleNode: <InlineTitle value={a.title} onSave={(title) => updateArea(a.id, { title })} />,
        icon: '◼',
        color: '#5b6b8c',
        actions: <button className="btn subtle" onClick={() => deleteArea(a, ctx)}>Delete Area</button>,
        sections: [
          { key: 'todos', items: todos.filter((t) => shown(t) && t.areaId === a.id && !t.projectId).sort(byIndex) },
          { key: 'projects', title: 'Projects', items: ctx.projects.filter((p) => p.areaId === a.id) },
        ],
        defaults: { areaId: a.id, start: 'anytime' },
      };
    }
  }
}

/** Scheduled/deadline items show in Today even inside a Someday project (like Things). */
function parentActiveOrScheduled(t: Task, ctx: Ctx) {
  if (!t.projectId) return true;
  const p = ctx.byId.get(t.projectId);
  return !!p && alive(p) && p.status === 'open';
}

async function deleteArea(a: Area, ctx: Ctx) {
  if (!confirm(`Delete area "${a.title}"? Its projects and to-dos are kept, just moved out of the area.`)) return;
  await updateTasks(ctx.tasks.filter((t) => t.areaId === a.id).map((t) => t.id), { areaId: null });
  await updateArea(a.id, { deleted: true });
  ctx.open({ kind: 'today' });
}

// --- Sidebar ---------------------------------------------------------------

function Sidebar({ view, ctx, onSettings }: { view: View; ctx: Ctx; onSettings: () => void }) {
  const counts: Partial<Record<ListKind, number>> = {
    inbox: ctx.tasks.filter((t) => t.kind === 'todo' && alive(t) && t.status === 'open' && t.start === 'inbox' && !t.startDate && !t.projectId && !t.areaId).length,
    today: ctx.tasks.filter((t) => t.kind === 'todo' && alive(t) && t.status === 'open' && inToday(t, ctx.today) && parentActiveOrScheduled(t, ctx)).length,
  };
  const active = (v: View) => v.kind === view.kind && ('id' in v ? 'id' in view && v.id === view.id : true);
  const projectsOf = (areaId: string | null) => ctx.projects.filter((p) => (p.areaId ?? null) === areaId);

  const projectLink = (p: Task) => (
    <button key={p.id} className={'nav-item project' + (active({ kind: 'project', id: p.id }) ? ' active' : '')} onClick={() => ctx.open({ kind: 'project', id: p.id })}>
      <ProgressPie p={p} ctx={ctx} />
      <span className="nav-label">{p.title || 'New Project'}</span>
    </button>
  );

  return (
    <nav className="sidebar">
      <div className="nav-group">
        {LISTS.map((l, i) => (
          <div key={l.kind}>
            {(i === 2 || i === 5) && <div className="nav-gap" />}
            <button className={'nav-item' + (active({ kind: l.kind }) ? ' active' : '')} onClick={() => ctx.open({ kind: l.kind })}>
              <span className="nav-icon" style={{ color: l.color }}>{l.icon}</span>
              <span className="nav-label">{l.label}</span>
              {!!counts[l.kind] && <span className="nav-count">{counts[l.kind]}</span>}
            </button>
          </div>
        ))}
      </div>
      <div className="nav-group">{projectsOf(null).map(projectLink)}</div>
      {ctx.areas.map((a) => (
        <div className="nav-group" key={a.id}>
          <button className={'nav-item area' + (active({ kind: 'area', id: a.id }) ? ' active' : '')} onClick={() => ctx.open({ kind: 'area', id: a.id })}>
            <span className="nav-icon">◼</span>
            <span className="nav-label">{a.title}</span>
          </button>
          {projectsOf(a.id).map(projectLink)}
        </div>
      ))}
      <div className="sidebar-footer">
        <button className="btn subtle" onClick={async () => {
          const title = prompt('New project name');
          if (title) ctx.open({ kind: 'project', id: await createTask({ kind: 'project', title, start: 'anytime' }) });
        }}>＋ Project</button>
        <button className="btn subtle" onClick={async () => {
          const title = prompt('New area name');
          if (title) ctx.open({ kind: 'area', id: await createArea(title) });
        }}>＋ Area</button>
        <div className="spacer" />
        <SyncBadge onClick={onSettings} />
      </div>
    </nav>
  );
}

function ProgressPie({ p, ctx }: { p: Task; ctx: Ctx }) {
  const items = ctx.tasks.filter((t) => t.projectId === p.id && t.kind === 'todo' && alive(t));
  const ratio = items.length ? items.filter((t) => t.status !== 'open').length / items.length : 0;
  return <span className="pie" style={{ background: `conic-gradient(#3b82f6 ${ratio * 360}deg, transparent 0)` }} />;
}

function SyncBadge({ onClick }: { onClick: () => void }) {
  const { state, lastError } = useSyncExternalStore(subscribeSync, getSyncState);
  const label = { local: 'Local only', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error' }[state];
  return (
    <button className={'sync-badge ' + state} onClick={onClick} title={lastError || 'Sync settings'}>
      <span className="dot" /> {label}
    </button>
  );
}

// --- Rows --------------------------------------------------------------------

function Check({ t }: { t: Task }) {
  const done = t.status !== 'open';
  return (
    <button
      className={'check' + (done ? ' checked' : '') + (t.status === 'canceled' ? ' canceled' : '')}
      aria-label={done ? 'Mark as open' : 'Complete'}
      onClick={(e) => {
        e.stopPropagation();
        void updateTask(t.id, done ? { status: 'open', completedAt: null } : { status: 'done', completedAt: Date.now() });
      }}
    />
  );
}

function TaskRow({ t, ctx, view, expanded, onExpand }: { t: Task; ctx: Ctx; view: View; expanded: boolean; onExpand: (id: string | null) => void }) {
  if (expanded) return <TaskEditor t={t} ctx={ctx} onClose={() => onExpand(null)} />;
  const project = t.projectId ? ctx.byId.get(t.projectId) : undefined;
  const area = t.areaId ? ctx.areas.find((a) => a.id === t.areaId) : undefined;
  const showParent = view.kind !== 'project' && view.kind !== 'area';
  const showDate = t.startDate && !['today', 'upcoming'].includes(view.kind) && view.kind !== 'logbook';
  const clDone = t.checklist.filter((c) => c.done).length;
  return (
    <div className={'task' + (t.status !== 'open' ? ' done' : '')} onClick={() => onExpand(t.id)}>
      <Check t={t} />
      <div className="task-body">
        <div className="task-line">
          {view.kind === 'anytime' && inToday(t, ctx.today) && <span className="star">★</span>}
          {showDate && <span className="date-chip">{dayLabel(t.startDate!)}</span>}
          <span className={'task-title' + (t.title ? '' : ' placeholder')}>{t.title || 'New To-Do'}</span>
          {t.notes && <span className="icon-hint" title="Has notes">≡</span>}
          {t.checklist.length > 0 && <span className="icon-hint">{clDone}/{t.checklist.length}</span>}
          {t.tagIds.map((id) => ctx.tagById.get(id)).filter((x) => x && !x.deleted).map((tag) => (
            <span key={tag!.id} className="tag">{tag!.title}</span>
          ))}
          <span className="spacer" />
          {t.deadline && t.status === 'open' && (
            <span className={'deadline' + (t.deadline <= ctx.today ? ' overdue' : '')}>⚑ {daysLeft(t.deadline)}</span>
          )}
          {view.kind === 'trash' && (
            <button className="btn subtle small" onClick={(e) => { e.stopPropagation(); void updateTask(t.id, { trashed: false }); }}>Restore</button>
          )}
        </div>
        {showParent && (project || area) && <div className="task-parent">{project?.title ?? area?.title}</div>}
      </div>
    </div>
  );
}

function ProjectRow({ p, ctx }: { p: Task; ctx: Ctx }) {
  return (
    <div className={'task project-row' + (p.status !== 'open' ? ' done' : '')} onClick={() => ctx.open({ kind: 'project', id: p.id })}>
      <ProgressPie p={p} ctx={ctx} />
      <div className="task-body">
        <div className="task-line">
          <span className="task-title">{p.title || 'New Project'}</span>
          <span className="spacer" />
          {p.deadline && p.status === 'open' && <span className={'deadline' + (p.deadline <= ctx.today ? ' overdue' : '')}>⚑ {daysLeft(p.deadline)}</span>}
          {p.trashed && (
            <button className="btn subtle small" onClick={(e) => { e.stopPropagation(); void restoreProject(p, ctx); }}>Restore</button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeadingRow({ h, onAdd }: { h: Task; onAdd: () => void }) {
  return (
    <div className="heading-row">
      <InlineTitle value={h.title} placeholder="Heading" onSave={(title) => updateTask(h.id, { title })} small />
      <button className="btn subtle small" onClick={onAdd} title="Add to-do under this heading">＋</button>
      <button className="btn subtle small" title="Delete heading (keeps its to-dos)" onClick={async () => {
        const ids = (await db.tasks.where('projectId').equals(h.projectId ?? '').toArray()).filter((t) => t.headingId === h.id).map((t) => t.id);
        await updateTasks(ids, { headingId: null });
        await updateTask(h.id, { trashed: true });
      }}>×</button>
    </div>
  );
}

// --- Editors -------------------------------------------------------------------

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(el) && !el.closest('.task, .fab, .modal')) cb.current();
    };
    const id = setTimeout(() => document.addEventListener('click', handler));
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [ref]);
}

function TaskEditor({ t, ctx, onClose }: { t: Task; ctx: Ctx; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes);
  const latest = useRef({ title, notes, t });
  latest.current = { title, notes, t };
  useOutsideClick(ref, onClose);

  // Persist on unmount (closing, switching task, navigating away).
  useEffect(() => () => {
    const { title, notes, t } = latest.current;
    if (title !== t.title || notes !== t.notes) void updateTask(t.id, { title, notes });
  }, []);

  const commit = () => {
    if (title !== t.title || notes !== t.notes) void updateTask(t.id, { title, notes });
  };

  return (
    <div className="task editor" ref={ref}>
      <div className="task-line">
        <Check t={t} />
        <input
          className="title-input"
          autoFocus={!t.title}
          placeholder="New To-Do"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit(); onClose(); } }}
        />
      </div>
      <AutoTextarea className="notes-input" placeholder="Notes" value={notes} onChange={setNotes} onBlur={commit} />
      <Checklist t={t} />
      <TagPicker t={t} ctx={ctx} />
      <div className="editor-bar">
        <WhenPicker t={t} today={ctx.today} />
        <label className="field">
          <span>⚑ Deadline</span>
          <input type="date" value={t.deadline ?? ''} onChange={(e) => updateTask(t.id, { deadline: e.target.value || null })} />
        </label>
        <MovePicker t={t} ctx={ctx} />
        <span className="spacer" />
        {t.status === 'open' && (
          <button className="btn subtle small" onClick={() => updateTask(t.id, { status: 'canceled', completedAt: Date.now() })}>Cancel to-do</button>
        )}
        <button className="btn subtle small danger" onClick={() => { void updateTask(t.id, { trashed: true }); onClose(); }}>Delete</button>
      </div>
    </div>
  );
}

function AutoTextarea({ value, onChange, onBlur, placeholder, className }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
}

type When = 'inbox' | 'today' | 'evening' | 'anytime' | 'someday' | 'date';

function WhenPicker({ t, today }: { t: Task; today: string }) {
  const current: When = t.startDate ? (t.startDate <= today ? (t.evening ? 'evening' : 'today') : 'date') : t.start;
  const set = (w: When) => {
    const patch: Record<When, Partial<Task>> = {
      inbox: { start: 'inbox', startDate: null, evening: false },
      today: { start: 'anytime', startDate: today, evening: false },
      evening: { start: 'anytime', startDate: today, evening: true },
      anytime: { start: 'anytime', startDate: null, evening: false },
      someday: { start: 'someday', startDate: null, evening: false },
      date: { start: 'anytime', startDate: addDays(today, 1), evening: false },
    };
    void updateTask(t.id, patch[w]);
  };
  return (
    <label className="field">
      <span>★ When</span>
      <select value={current} onChange={(e) => set(e.target.value as When)}>
        {t.kind === 'todo' && <option value="inbox">Inbox</option>}
        <option value="today">Today</option>
        <option value="evening">This Evening</option>
        <option value="anytime">Anytime</option>
        <option value="someday">Someday</option>
        <option value="date">Date…</option>
      </select>
      {current === 'date' && (
        <input type="date" value={t.startDate ?? ''} min={addDays(today, 1)} onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })} />
      )}
    </label>
  );
}

function MovePicker({ t, ctx }: { t: Task; ctx: Ctx }) {
  const value = t.projectId ? `p:${t.projectId}` : t.areaId ? `a:${t.areaId}` : '';
  const move = (v: string) => {
    const start = t.start === 'inbox' && v ? 'anytime' : t.start;
    if (v.startsWith('p:')) void updateTask(t.id, { projectId: v.slice(2), areaId: null, headingId: null, start });
    else if (v.startsWith('a:')) void updateTask(t.id, { areaId: v.slice(2), projectId: null, headingId: null, start });
    else void updateTask(t.id, { areaId: null, projectId: null, headingId: null });
  };
  return (
    <label className="field">
      <span>→ List</span>
      <select value={value} onChange={(e) => move(e.target.value)}>
        <option value="">— None —</option>
        {ctx.projects.filter((p) => !p.areaId).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.title}</option>)}
        {ctx.areas.map((a) => (
          <optgroup key={a.id} label={a.title}>
            <option value={`a:${a.id}`}>{a.title}</option>
            {ctx.projects.filter((p) => p.areaId === a.id).map((p) => <option key={p.id} value={`p:${p.id}`}>  {p.title}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Checklist({ t }: { t: Task }) {
  const [draft, setDraft] = useState('');
  const set = (checklist: Task['checklist']) => updateTask(t.id, { checklist });
  return (
    <div className="checklist">
      {t.checklist.map((item) => (
        <div className="cl-item" key={item.id}>
          <button className={'check small' + (item.done ? ' checked' : '')} onClick={() => set(t.checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)))} />
          <input
            className={item.done ? 'done' : ''}
            defaultValue={item.title}
            onBlur={(e) => e.target.value !== item.title && set(t.checklist.map((c) => (c.id === item.id ? { ...c, title: e.target.value } : c)))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="btn subtle small" onClick={() => set(t.checklist.filter((c) => c.id !== item.id))}>×</button>
        </div>
      ))}
      <input
        className="cl-new"
        placeholder="＋ Checklist item"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            void set([...t.checklist, { id: uid(), title: draft.trim(), done: false }]);
            setDraft('');
          }
        }}
      />
    </div>
  );
}

function TagPicker({ t, ctx }: { t: Task; ctx: Ctx }) {
  const [draft, setDraft] = useState('');
  const toggle = (id: string) =>
    updateTask(t.id, { tagIds: t.tagIds.includes(id) ? t.tagIds.filter((x) => x !== id) : [...t.tagIds, id] });
  return (
    <div className="tags">
      {ctx.tags.map((tag) => (
        <button key={tag.id} className={'tag' + (t.tagIds.includes(tag.id) ? ' on' : ' off')} onClick={() => toggle(tag.id)}>{tag.title}</button>
      ))}
      <input
        className="tag-new"
        placeholder="＋ tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key !== 'Enter' || !draft.trim()) return;
          const name = draft.trim();
          setDraft('');
          const existing = ctx.tags.find((x) => x.title.toLowerCase() === name.toLowerCase());
          const id = existing?.id ?? (await createTag(name));
          if (!t.tagIds.includes(id)) void updateTask(t.id, { tagIds: [...t.tagIds, id] });
        }}
      />
    </div>
  );
}

function InlineTitle({ value, onSave, placeholder = 'Untitled', small }: { value: string; onSave: (v: string) => void; placeholder?: string; small?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={small ? 'heading-input' : 'h1-input'}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

// --- Project -----------------------------------------------------------------

function ProjectTitle({ p, done, total }: { p: Task; done: number; total: number }) {
  const ratio = total ? done / total : 0;
  return (
    <>
      <span className="pie big" style={{ background: `conic-gradient(#3b82f6 ${ratio * 360}deg, transparent 0)` }} />
      <InlineTitle value={p.title} placeholder="New Project" onSave={(title) => updateTask(p.id, { title })} />
    </>
  );
}

async function restoreProject(p: Task, ctx: Ctx) {
  await updateTasks([p.id, ...ctx.tasks.filter((t) => t.projectId === p.id && t.trashed).map((t) => t.id)], { trashed: false });
}

function ProjectHeader({ p, ctx, items, headings }: { p: Task; ctx: Ctx; items: Task[]; headings: Task[] }) {
  const [notes, setNotes] = useState(p.notes);
  useEffect(() => setNotes(p.notes), [p.notes]);
  const open = items.filter((t) => t.status === 'open');
  return (
    <div className="project-header">
      <AutoTextarea className="notes-input" placeholder="Notes" value={notes} onChange={setNotes} onBlur={() => notes !== p.notes && updateTask(p.id, { notes })} />
      <div className="editor-bar">
        <WhenPicker t={p} today={ctx.today} />
        <label className="field">
          <span>⚑ Deadline</span>
          <input type="date" value={p.deadline ?? ''} onChange={(e) => updateTask(p.id, { deadline: e.target.value || null })} />
        </label>
        <label className="field">
          <span>◼ Area</span>
          <select value={p.areaId ?? ''} onChange={(e) => updateTask(p.id, { areaId: e.target.value || null })}>
            <option value="">— None —</option>
            {ctx.areas.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn subtle small" onClick={() => createTask({ kind: 'heading', title: '', projectId: p.id, start: 'anytime', index: Date.now() })}>＋ Heading</button>
        {p.status === 'open' ? (
          <button className="btn small" onClick={async () => {
            if (open.length && !confirm(`Complete project and its ${open.length} open to-do(s)?`)) return;
            const now = Date.now();
            await updateTasks([p.id, ...open.map((t) => t.id)], { status: 'done', completedAt: now });
          }}>Complete Project</button>
        ) : (
          <button className="btn small" onClick={() => updateTask(p.id, { status: 'open', completedAt: null })}>Reopen</button>
        )}
        {p.trashed ? (
          <button className="btn subtle small" onClick={() => restoreProject(p, ctx)}>Restore</button>
        ) : (
          <button className="btn subtle small danger" onClick={async () => {
            if (!confirm(`Move project "${p.title}" and its to-dos to Trash?`)) return;
            const children = [...items, ...headings].filter((t) => !t.trashed).map((t) => t.id);
            await updateTasks([p.id, ...children], { trashed: true });
            ctx.open({ kind: 'today' });
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}

// --- Settings ----------------------------------------------------------------

function Settings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const { state, lastError } = useSyncExternalStore(subscribeSync, getSyncState);
  useEffect(() => { void getConfig().then((c) => { setUrl(c.url); setToken(c.token); }); }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sync</h2>
        <p className="muted">
          Data lives on this device and syncs to your server.
          {isNative ? ' Paste the setup link (https://server/#token=…) or fill both fields.' : ' Leave the URL empty when the app is served by the sync server itself.'}
        </p>
        <label className="stack">
          <span>Server URL</span>
          <input
            placeholder="https://things.example.com"
            value={url}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => {
              // Accept a full setup link: https://server/#token=XXXX
              const [base, hash] = e.target.value.split('#');
              const t = new URLSearchParams(hash ?? '').get('token');
              if (t) { setUrl(base.replace(/\/+$/, '')); setToken(t); } else setUrl(e.target.value);
            }}
          />
        </label>
        <label className="stack">
          <span>Token</span>
          <input type="password" placeholder="OPEN_THINGS_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <p className="muted">Status: {state}{lastError && ` — ${lastError}`}</p>
        <p className="muted">
          App version {APP_VERSION}{isNative ? ' (native)' : ''}
          {isNative && <> · <button className="btn subtle small" onClick={() => void checkForUpdate()}>Check for updates</button></>}
        </p>
        {isNative && <UpdateStatus />}
        <div className="modal-actions">
          <button className="btn subtle danger" onClick={async () => {
            if (!confirm('Erase all local data on this device? Unsynced changes are lost; synced data will be downloaded again.')) return;
            await db.delete();
            location.reload();
          }}>Reset local data</button>
          <span className="spacer" />
          <button className="btn subtle" onClick={() => void syncNow()}>Sync now</button>
          <button className="btn" onClick={async () => { await setConfig({ url, token }); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}
