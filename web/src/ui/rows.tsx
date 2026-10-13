import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { db, updateTask, updateTasks, type Task } from '../db';
import { dayLabel, daysLeft } from '../dates';
import { markCompleted, inToday, projectProgress, dayNumber, type Ctx, type Section, type View } from '../model';
import { describe } from '../repeat';
import { TaskEditor } from './editor';
import { WhenSheet, MoveSheet, liveTemplate } from './pickers';
import { CalendarIcon, MoveIcon, MoonIcon, RepeatIcon, StarIcon, NotesIcon, ChecklistIcon, FlagIcon, PlusIcon, CloseIcon } from './icons';

export function Check({ t }: { t: Task }) {
  const done = t.status !== 'open';
  return (
    <motion.button
      className={'check' + (done ? ' checked' : '') + (t.status === 'canceled' ? ' canceled' : '')}
      aria-label={done ? 'Mark as open' : 'Complete'}
      whileTap={{ scale: 0.82 }}
      onPointerDown={(e) => e.stopPropagation()} // don't open the row
      onClick={(e) => {
        e.stopPropagation();
        if (done) void updateTask(t.id, { status: 'open', completedAt: null });
        else {
          markCompleted(t.id); // keep it on screen briefly, then animate it out
          void updateTask(t.id, { status: 'done', completedAt: Date.now() });
        }
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden>
        {t.status === 'canceled' ? (
          <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" />
        ) : (
          <motion.path d="M5 10.5l3.3 3.3L15 7" initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} />
        )}
      </svg>
    </motion.button>
  );
}

export function ProgressPie({ p, ctx, size = 18 }: { p: Task; ctx: Ctx; size?: number }) {
  const ratio = p.status !== 'open' ? 1 : projectProgress(p, ctx);
  const r = 5.2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="pie" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r={r / 2} fill="none" stroke="currentColor" strokeWidth={r}
        strokeDasharray={`${(ratio * c) / 2} ${c}`} transform="rotate(-90 8 8)" />
    </svg>
  );
}

const rowMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0, transition: { duration: 0.25 } },
  transition: { duration: 0.22 },
};

export function TaskRow({ t, ctx, view, expanded, onExpand }: {
  t: Task;
  ctx: Ctx;
  view: View;
  expanded: boolean;
  onExpand: (id: string | null) => void;
}) {
  const [sheet, setSheet] = useState<'when' | 'move' | null>(null);
  const dragging = useRef(false); // a swipe must not also count as a tap
  const x = useMotionValue(0);
  const whenOpacity = useTransform(x, [0, 70], [0, 1]);
  const moveOpacity = useTransform(x, [-70, 0], [1, 0]);
  const project = t.projectId ? ctx.byId.get(t.projectId) : undefined;
  const area = t.areaId ? ctx.areas.find((a) => a.id === t.areaId) : undefined;
  const inList = view.kind === 'project' || view.kind === 'area' || view.kind === 'anytime';
  const swipeable = !t.ghost && !t.repeat && view.kind !== 'trash';
  const repeating = !t.repeat && !t.ghost && !!liveTemplate(t, ctx);
  const clDone = t.checklist.filter((c) => c.done).length;
  const tags = t.tagIds.map((id) => ctx.tagById.get(id)).filter((x) => x && !x.deleted);
  const showDate = t.startDate && !['today', 'upcoming', 'logbook'].includes(view.kind);
  const evening = t.evening && t.startDate && t.startDate <= ctx.today;

  return (
    <motion.div className="row-wrap" layout="position" {...rowMotion}>
      {expanded ? (
        <TaskEditor t={t} ctx={ctx} onClose={() => onExpand(null)} />
      ) : (
        <>
          {swipeable && (
            <div className="swipe-bg">
              <motion.span className="swipe-when" style={{ opacity: whenOpacity }}><CalendarIcon size={20} /></motion.span>
              <motion.span className="swipe-move" style={{ opacity: moveOpacity }}><MoveIcon size={20} /></motion.span>
            </div>
          )}
          <motion.div
            className={'task' + (t.status !== 'open' ? ' done' : '') + (t.ghost ? ' ghost' : '')}
            style={{ x }}
            drag={swipeable ? 'x' : false}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragStart={() => { dragging.current = true; }}
            onDragEnd={(_, info) => {
              setTimeout(() => { dragging.current = false; }, 50);
              if (info.offset.x > 70) setSheet('when');
              else if (info.offset.x < -70) setSheet('move');
            }}
            // A projected copy opens its template (listed under "Repeating").
            onTap={(e) => {
              if (dragging.current || (e.target as HTMLElement).closest('button')) return; // swipe, checkbox, Restore
              onExpand(t.ghost ? t.templateId! : t.id);
            }}
          >
            {t.repeat || t.ghost ? <span className="repeat-mark"><RepeatIcon size={18} /></span> : <Check t={t} />}
            <div className="task-body">
              <div className="task-line">
                {view.kind === 'anytime' && inToday(t, ctx.today) && <StarIcon size={13} className="today-color" />}
                {evening && view.kind !== 'today' && <MoonIcon size={13} className="evening-color" />}
                {showDate && !inToday(t, ctx.today) && <span className="date-chip">{dayLabel(t.startDate!)}</span>}
                <span className={'task-title' + (t.title ? '' : ' placeholder')}>{t.title || 'New To-Do'}</span>
                {repeating && <RepeatIcon size={13} className="hint" />}
                {t.notes && <NotesIcon size={13} className="hint" />}
                {t.checklist.length > 0 && <span className="hint small"><ChecklistIcon size={13} /> {clDone}/{t.checklist.length}</span>}
              </div>
              {(t.repeat || (!inList && (project || area)) || tags.length > 0 || (t.deadline && t.status === 'open')) && (
                <div className="task-meta">
                  {t.repeat && <span>{describe(t.repeat)}</span>}
                  {!t.repeat && !inList && (project || area) && <span>{project?.title ?? area?.title}</span>}
                  {tags.map((tag) => <span key={tag!.id} className="tag">{tag!.title}</span>)}
                  {t.deadline && t.status === 'open' && (
                    <span className={'deadline' + (t.deadline <= ctx.today ? ' overdue' : '')}><FlagIcon size={11} /> {daysLeft(t.deadline)}</span>
                  )}
                </div>
              )}
            </div>
            {view.kind === 'trash' && (
              <button className="text-btn small" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); void updateTask(t.id, { trashed: false }); }}>Restore</button>
            )}
          </motion.div>
        </>
      )}
      {swipeable && (
        <>
          <WhenSheet t={t} ctx={ctx} open={sheet === 'when'} onClose={() => setSheet(null)} />
          <MoveSheet t={t} ctx={ctx} open={sheet === 'move'} onClose={() => setSheet(null)} />
        </>
      )}
    </motion.div>
  );
}

export function ProjectRow({ p, ctx, onOpen }: { p: Task; ctx: Ctx; onOpen: (v: View) => void }) {
  const repeating = !p.repeat && !p.ghost && !!liveTemplate(p, ctx);
  return (
    <motion.div className="row-wrap" layout="position" {...rowMotion}>
      <motion.div
        className={'task project-row' + (p.status !== 'open' ? ' done' : '') + (p.ghost ? ' ghost' : '')}
        whileTap={{ scale: 0.99 }}
        onTap={(e) => !(e.target as HTMLElement).closest('button') && onOpen({ kind: 'project', id: p.ghost ? p.templateId! : p.id })}
      >
        {p.repeat || p.ghost ? <span className="repeat-mark"><RepeatIcon size={18} /></span> : <span className="project-pie"><ProgressPie p={p} ctx={ctx} size={20} /></span>}
        <div className="task-body">
          <div className="task-line">
            <span className="task-title">{p.title || 'New Project'}</span>
            {repeating && <RepeatIcon size={13} className="hint" />}
          </div>
          {(p.repeat || (p.deadline && p.status === 'open')) && (
            <div className="task-meta">
              {p.repeat && <span>{describe(p.repeat)}</span>}
              {p.deadline && p.status === 'open' && (
                <span className={'deadline' + (p.deadline <= ctx.today ? ' overdue' : '')}><FlagIcon size={11} /> {daysLeft(p.deadline)}</span>
              )}
            </div>
          )}
        </div>
        {p.trashed && (
          <button className="text-btn small" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
            e.stopPropagation();
            void updateTasks([p.id, ...ctx.all.filter((t) => t.projectId === p.id && t.trashed).map((t) => t.id)], { trashed: false });
          }}>Restore</button>
        )}
      </motion.div>
    </motion.div>
  );
}

export function SectionHeader({ s, onAdd }: { s: Section; onAdd?: () => void }) {
  if (s.heading) {
    const h = s.heading;
    return (
      <div className="heading-row">
        <HeadingTitle h={h} />
        {onAdd && <button className="icon-btn small" onClick={onAdd} aria-label="Add to-do under heading"><PlusIcon size={18} /></button>}
        <button className="icon-btn small" aria-label="Delete heading (keeps its to-dos)" onClick={async () => {
          const ids = (await db.tasks.where('projectId').equals(h.projectId ?? '').toArray()).filter((t) => t.headingId === h.id).map((t) => t.id);
          await updateTasks(ids, { headingId: null });
          await updateTask(h.id, { trashed: true });
        }}><CloseIcon size={16} /></button>
      </div>
    );
  }
  if (!s.title) return null;
  return (
    <h2 className={'section-title' + (s.date ? ' dated' : '') + (s.evening ? ' evening' : '')}>
      {s.date && <span className="day-num">{dayNumber(s.date)}</span>}
      {s.evening && <MoonIcon size={16} />}
      <span>{s.title}</span>
    </h2>
  );
}

function HeadingTitle({ h }: { h: Task }) {
  const [v, setV] = useState(h.title);
  return (
    <input
      className="heading-input"
      value={v}
      placeholder="New Heading"
      autoFocus={!h.title}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== h.title && updateTask(h.id, { title: v })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
