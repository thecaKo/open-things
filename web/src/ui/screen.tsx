// One list (Inbox, Today, a project…) with Things' big title and "+" button.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createTask, updateTask, updateTasks, updateArea, type Task } from '../db';
import { daysLeft, parse } from '../dates';
import { buildView, alive, type Ctx, type View, type ListKind } from '../model';
import { describe, stopRepeating } from '../repeat';
import { TaskRow, ProjectRow, SectionHeader, ProgressPie } from './rows';
import { AutoTextarea } from './editor';
import { Sheet, ActionList, Action } from './Sheet';
import { WhenSheet, DeadlineSheet, MoveSheet, RepeatSheet, whenInfo, liveTemplate } from './pickers';
import { LIST_ICON } from './nav';
import {
  ChevronLeft, MoreIcon, PlusIcon, AreaIcon, CalendarIcon, FlagIcon, RepeatIcon, MoveIcon, HeadingIcon, CheckIcon, TrashIcon,
} from './icons';

type Menu = 'menu' | 'when' | 'deadline' | 'repeat' | 'move' | null;

export function ListScreen({ view, ctx, wide, onBack, onOpen, backLabel }: {
  view: View;
  ctx: Ctx;
  wide: boolean;
  onBack: () => void;
  onOpen: (v: View) => void;
  backLabel: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const model = buildView(view, ctx);
  const p = model.project;
  const add = async (defaults: Partial<Task> | undefined = model.defaults) => {
    if (defaults) setExpanded(await createTask(defaults));
  };

  // Keyboard (wide screens): "n" or space creates a to-do here.
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if ((e.key === 'n' || e.key === ' ') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        void addRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const list = view.kind in LIST_ICON ? LIST_ICON[view.kind as ListKind] : null;
  const hasMenu = !!p || !!model.area || (view.kind === 'trash' && model.sections[0]?.items.length > 0);
  const empty = model.sections.every((s) => s.items.length === 0 && !s.heading);

  return (
    <div className="screen-inner">
      <header className="topbar">
        {!wide && (
          <motion.button whileTap={{ scale: 0.92 }} className="back-btn" onClick={onBack}>
            <ChevronLeft size={22} /> {backLabel}
          </motion.button>
        )}
        <span className="spacer" />
        {hasMenu && (
          <motion.button whileTap={{ scale: 0.9 }} className="icon-btn" aria-label="More" onClick={() => setMenu('menu')}><MoreIcon /></motion.button>
        )}
      </header>

      <div className="content">
        <div className="title-row">
          {list && <span className="title-icon" style={{ color: list.color }}><list.icon size={30} /></span>}
          {p && (p.repeat ? <span className="title-icon accent"><RepeatIcon size={28} /></span> : <span className="title-icon accent"><ProgressPie p={p} ctx={ctx} size={28} /></span>)}
          {model.area && <span className="title-icon" style={{ color: 'var(--area)' }}><AreaIcon size={30} /></span>}
          {p ? (
            <InlineTitle key={p.id} value={p.title} placeholder="New Project" onSave={(title) => updateTask(p.id, { title })} />
          ) : model.area ? (
            <InlineTitle key={model.area.id} value={model.area.title} placeholder="New Area" onSave={(title) => updateArea(model.area!.id, { title })} />
          ) : (
            <h1>{model.title}</h1>
          )}
        </div>

        {p && <ProjectHeader p={p} ctx={ctx} onMenu={setMenu} />}

        <div className="list">
          {model.sections.map((s) => (
            <section className="section" key={s.key}>
              <SectionHeader s={s} onAdd={s.heading ? () => void add(s.defaults) : undefined} />
              <AnimatePresence initial={false}>
                {s.items.map((t) =>
                  t.kind === 'project' ? (
                    <ProjectRow key={t.id} p={t} ctx={ctx} onOpen={onOpen} />
                  ) : (
                    <TaskRow key={t.id} t={t} ctx={ctx} view={view} expanded={expanded === t.id} onExpand={setExpanded} />
                  ),
                )}
              </AnimatePresence>
            </section>
          ))}
          {empty && (
            <motion.div className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
              {list && <span style={{ color: list.color }}><list.icon size={48} /></span>}
              <p>{model.empty ?? 'Nothing here.'}</p>
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {model.defaults && (
          <motion.button
            className="fab"
            aria-label="New To-Do"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: 'spring', damping: 18, stiffness: 400 }}
            onClick={() => void add()}
          >
            <PlusIcon size={28} />
          </motion.button>
        )}
      </AnimatePresence>

      {p && <ProjectMenus p={p} ctx={ctx} menu={menu} setMenu={setMenu} onLeave={() => onBack()} />}
      {model.area && (
        <Sheet open={menu === 'menu'} onClose={() => setMenu(null)}>
          <ActionList>
            <Action icon={<TrashIcon />} danger label="Delete Area" onClick={async () => {
              const a = model.area!;
              if (!confirm(`Delete area "${a.title}"? Its projects and to-dos are kept, just moved out of the area.`)) return;
              await updateTasks(ctx.tasks.filter((t) => t.areaId === a.id).map((t) => t.id), { areaId: null });
              await updateArea(a.id, { deleted: true });
              setMenu(null);
              onBack();
            }} />
          </ActionList>
        </Sheet>
      )}
      {view.kind === 'trash' && (
        <Sheet open={menu === 'menu'} onClose={() => setMenu(null)}>
          <ActionList>
            <Action icon={<TrashIcon />} danger label="Empty Trash" onClick={async () => {
              if (!confirm('Permanently delete all items in Trash?')) return;
              await updateTasks(ctx.all.filter((t) => t.trashed).map((t) => t.id), { deleted: true });
              setMenu(null);
            }} />
          </ActionList>
        </Sheet>
      )}
    </div>
  );
}

function InlineTitle({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="h1-input"
      value={v}
      placeholder={placeholder}
      autoFocus={!value}
      enterKeyHint="done"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ProjectHeader({ p, ctx, onMenu }: { p: Task; ctx: Ctx; onMenu: (m: Menu) => void }) {
  const [notes, setNotes] = useState(p.notes);
  useEffect(() => setNotes(p.notes), [p.notes]);
  const when = whenInfo(p, ctx.today);
  const tpl = liveTemplate(p, ctx);
  return (
    <div className="project-header">
      <AutoTextarea className="notes-input" placeholder="Notes" value={notes} onChange={setNotes} onBlur={() => notes !== p.notes && updateTask(p.id, { notes })} />
      {(when || p.deadline || tpl) && (
        <div className="chips">
          {when && !p.repeat && <button className={'chip ' + when.cls} onClick={() => onMenu('when')}>{when.icon}{when.label}</button>}
          {p.deadline && !p.repeat && (
            <button className={'chip deadline' + (p.deadline <= ctx.today ? ' overdue' : '')} onClick={() => onMenu('deadline')}>
              <FlagIcon size={13} />{parse(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {daysLeft(p.deadline)}
            </button>
          )}
          {tpl && <button className="chip repeat" onClick={() => onMenu('repeat')}><RepeatIcon size={13} />{describe(tpl.repeat!)}</button>}
        </div>
      )}
      {p.repeat && <p className="card-note">Repeating project template: each copy gets these to-dos.</p>}
    </div>
  );
}

function ProjectMenus({ p, ctx, menu, setMenu, onLeave }: {
  p: Task;
  ctx: Ctx;
  menu: Menu;
  setMenu: (m: Menu) => void;
  onLeave: () => void;
}) {
  const close = () => setMenu(null);
  const children = ctx.all.filter((t) => t.projectId === p.id);
  const open = children.filter((t) => t.kind === 'todo' && t.status === 'open' && alive(t));
  return (
    <>
      <Sheet open={menu === 'menu'} onClose={close}>
        <ActionList>
          {!p.repeat && <Action icon={<CalendarIcon />} color="var(--upcoming)" label="When…" onClick={() => setMenu('when')} />}
          {!p.repeat && <Action icon={<FlagIcon />} color="var(--deadline)" label="Deadline…" onClick={() => setMenu('deadline')} />}
          {!p.trashed && <Action icon={<RepeatIcon />} color="var(--accent)" label="Repeat…" onClick={() => setMenu('repeat')} />}
          <Action icon={<MoveIcon />} color="var(--accent)" label="Move to Area…" onClick={() => setMenu('move')} />
          <Action icon={<HeadingIcon />} color="var(--accent)" label="Add Heading" onClick={() => {
            void createTask({ kind: 'heading', title: '', projectId: p.id, start: 'anytime', index: Date.now() });
            close();
          }} />
        </ActionList>
        <ActionList>
          {!p.repeat && (p.status === 'open' ? (
            <Action icon={<CheckIcon />} color="var(--accent)" label="Complete Project" onClick={async () => {
              if (open.length && !confirm(`Complete project and its ${open.length} open to-do(s)?`)) return;
              await updateTasks([p.id, ...open.map((t) => t.id)], { status: 'done', completedAt: Date.now() });
              close();
            }} />
          ) : (
            <Action icon={<CheckIcon />} label="Reopen Project" onClick={() => { void updateTask(p.id, { status: 'open', completedAt: null }); close(); }} />
          ))}
          {p.trashed ? (
            <Action label="Restore Project" onClick={() => { void updateTasks([p.id, ...children.filter((t) => t.trashed).map((t) => t.id)], { trashed: false }); close(); }} />
          ) : p.repeat ? (
            <Action icon={<TrashIcon />} danger label="Stop Repeating" onClick={async () => {
              if (!confirm('Stop repeating? Copies already created are kept.')) return;
              await stopRepeating(p.id, ctx.all);
              close();
              onLeave();
            }} />
          ) : (
            <Action icon={<TrashIcon />} danger label="Delete Project" onClick={async () => {
              if (!confirm(`Move project "${p.title}" and its to-dos to Trash?`)) return;
              await updateTasks([p.id, ...children.filter((t) => !t.trashed).map((t) => t.id)], { trashed: true });
              close();
              onLeave();
            }} />
          )}
        </ActionList>
      </Sheet>
      <WhenSheet t={p} ctx={ctx} open={menu === 'when'} onClose={close} />
      <DeadlineSheet t={p} ctx={ctx} open={menu === 'deadline'} onClose={close} />
      <RepeatSheet t={p} ctx={ctx} open={menu === 'repeat'} onClose={close} />
      <MoveSheet t={p} ctx={ctx} open={menu === 'move'} onClose={close} />
    </>
  );
}
