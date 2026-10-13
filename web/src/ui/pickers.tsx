// Sheets that edit one attribute of a to-do/project, like Things' popovers.
import { useState, type ReactNode } from 'react';
import { updateTask, createTag, type Task, type RepeatRule } from '../db';
import { addDays, dayLabel } from '../dates';
import type { Ctx } from '../model';
import { describe, defaultRule, makeRepeating, stopRepeating, WEEKDAYS, ordinalLabel } from '../repeat';
import { Sheet, ActionList, Action } from './Sheet';
import { Calendar } from './Calendar';
import {
  StarIcon, MoonIcon, SomedayIcon, CalendarIcon, InboxIcon, AreaIcon, CheckIcon, CloseIcon, FlagIcon,
} from './icons';
import { ProgressPie } from './rows';

export type SheetKind = 'when' | 'deadline' | 'tags' | 'move' | 'repeat' | 'more' | null;

/** Chip describing when a task is scheduled (null when unscheduled). */
export function whenInfo(t: Task, today: string): { icon: ReactNode; label: string; cls: string } | null {
  if (t.startDate) {
    if (t.startDate <= today) {
      return t.evening
        ? { icon: <MoonIcon size={14} />, label: 'This Evening', cls: 'evening' }
        : { icon: <StarIcon size={14} />, label: 'Today', cls: 'today' };
    }
    return { icon: <CalendarIcon size={14} />, label: dayLabel(t.startDate), cls: 'upcoming' };
  }
  if (t.start === 'someday') return { icon: <SomedayIcon size={14} />, label: 'Someday', cls: 'someday' };
  return null;
}

export function WhenSheet({ t, ctx, open, onClose }: { t: Task; ctx: Ctx; open: boolean; onClose: () => void }) {
  const apply = (patch: Partial<Task>) => {
    void updateTask(t.id, patch);
    onClose();
  };
  const today = ctx.today;
  const unscheduled: Partial<Task> =
    t.kind === 'todo' && !t.projectId && !t.areaId ? { start: 'inbox', startDate: null, evening: false } : { start: 'anytime', startDate: null, evening: false };
  return (
    <Sheet open={open} onClose={onClose} title="When">
      <ActionList>
        <Action icon={<StarIcon />} color="var(--today)" label="Today" onClick={() => apply({ start: 'anytime', startDate: today, evening: false })} />
        <Action icon={<MoonIcon />} color="var(--evening)" label="This Evening" onClick={() => apply({ start: 'anytime', startDate: today, evening: true })} />
      </ActionList>
      <Calendar value={t.startDate} today={today} onPick={(d) => apply({ start: 'anytime', startDate: d, evening: false })} />
      <ActionList>
        <Action icon={<SomedayIcon />} color="var(--someday)" label="Someday" onClick={() => apply({ start: 'someday', startDate: null, evening: false })} />
        <Action icon={<CloseIcon />} label="Clear" onClick={() => apply(unscheduled)} />
      </ActionList>
    </Sheet>
  );
}

export function DeadlineSheet({ t, ctx, open, onClose }: { t: Task; ctx: Ctx; open: boolean; onClose: () => void }) {
  const apply = (deadline: string | null) => {
    void updateTask(t.id, { deadline });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={<><FlagIcon size={18} className="deadline-color" /> Deadline</>}>
      <Calendar value={t.deadline} today={ctx.today} onPick={apply} allowPast />
      {t.deadline && (
        <ActionList>
          <Action icon={<CloseIcon />} label="Remove Deadline" onClick={() => apply(null)} />
        </ActionList>
      )}
    </Sheet>
  );
}

export function TagsSheet({ t, ctx, open, onClose }: { t: Task; ctx: Ctx; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const toggle = (id: string) =>
    updateTask(t.id, { tagIds: t.tagIds.includes(id) ? t.tagIds.filter((x) => x !== id) : [...t.tagIds, id] });
  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    const existing = ctx.tags.find((x) => x.title.toLowerCase() === name.toLowerCase());
    const id = existing?.id ?? (await createTag(name));
    if (!t.tagIds.includes(id)) void updateTask(t.id, { tagIds: [...t.tagIds, id] });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Tags" action={<button className="text-btn" onClick={onClose}>Done</button>}>
      <div className="field-row">
        <input
          className="text-input"
          placeholder="New tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        {draft.trim() && <button className="text-btn" onClick={() => void add()}>Add</button>}
      </div>
      <ActionList>
        {ctx.tags.map((tag) => (
          <Action
            key={tag.id}
            label={tag.title}
            onClick={() => void toggle(tag.id)}
            detail={t.tagIds.includes(tag.id) ? <CheckIcon size={18} className="accent" /> : null}
          />
        ))}
      </ActionList>
      {!ctx.tags.length && <p className="muted center">No tags yet.</p>}
    </Sheet>
  );
}

/** Move a to-do to Inbox/project/area, or a project to an area. */
export function MoveSheet({ t, ctx, open, onClose }: { t: Task; ctx: Ctx; open: boolean; onClose: () => void }) {
  const isProject = t.kind === 'project';
  const move = (patch: Partial<Task>) => {
    const start = t.start === 'inbox' && (patch.projectId || patch.areaId) ? 'anytime' : t.start;
    void updateTask(t.id, { headingId: null, ...patch, ...(isProject ? {} : { start }) });
    onClose();
  };
  const current = (projectId: string | null, areaId: string | null) =>
    (t.projectId ?? null) === projectId && (isProject || projectId ? true : (t.areaId ?? null) === areaId) ? <CheckIcon size={18} className="accent" /> : null;
  return (
    <Sheet open={open} onClose={onClose} title="Move">
      <ActionList>
        {isProject ? (
          <Action icon={<CloseIcon />} label="No Area" onClick={() => move({ areaId: null })} detail={!t.areaId ? <CheckIcon size={18} className="accent" /> : null} />
        ) : (
          <Action
            icon={<InboxIcon />}
            color="var(--inbox)"
            label="Inbox"
            onClick={() => move({ projectId: null, areaId: null, start: 'inbox', startDate: null })}
            detail={!t.projectId && !t.areaId ? <CheckIcon size={18} className="accent" /> : null}
          />
        )}
        {!isProject && ctx.projects.filter((p) => !p.areaId).map((p) => (
          <Action key={p.id} icon={<ProgressPie p={p} ctx={ctx} />} label={p.title || 'New Project'} onClick={() => move({ projectId: p.id, areaId: null })} detail={current(p.id, null)} />
        ))}
      </ActionList>
      {ctx.areas.map((a) => (
        <ActionList key={a.id}>
          <Action
            icon={<AreaIcon />}
            color="var(--area)"
            label={<b>{a.title}</b>}
            onClick={() => move({ areaId: a.id, projectId: null })}
            detail={(isProject ? t.areaId === a.id : !t.projectId && t.areaId === a.id) ? <CheckIcon size={18} className="accent" /> : null}
          />
          {!isProject && ctx.projects.filter((p) => p.areaId === a.id).map((p) => (
            <Action key={p.id} icon={<ProgressPie p={p} ctx={ctx} />} label={p.title || 'New Project'} onClick={() => move({ projectId: p.id, areaId: null })} detail={current(p.id, null)} />
          ))}
        </ActionList>
      ))}
    </Sheet>
  );
}

// --- Repeat --------------------------------------------------------------------

type RepeatKind = 'never' | 'day' | 'week' | 'month' | 'year' | 'after';

export function liveTemplate(t: Task, ctx: Ctx) {
  const tpl = t.repeat ? t : t.templateId ? ctx.byId.get(t.templateId) : undefined;
  return tpl?.repeat && !tpl.trashed && !tpl.deleted ? tpl : undefined;
}

/** Edits the rule. On a copy it edits the template; on a plain task it converts it. */
export function RepeatSheet({ t, ctx, open, onClose }: { t: Task; ctx: Ctx; open: boolean; onClose: () => void }) {
  const tpl = liveTemplate(t, ctx);
  const rule = tpl?.repeat ?? null;
  const set = (patch: Partial<RepeatRule>) => tpl && updateTask(tpl.id, { repeat: { ...rule!, ...patch } });
  const kind: RepeatKind = !rule ? 'never' : rule.type === 'afterCompletion' ? 'after' : rule.unit;

  const changeKind = async (k: RepeatKind) => {
    if (k === 'never') {
      if (tpl && confirm('Stop repeating? Copies already created are kept.')) {
        await stopRepeating(tpl.id, ctx.all);
        onClose();
      }
    } else if (!tpl) {
      const start = t.startDate && t.startDate >= ctx.today ? t.startDate : ctx.today;
      await makeRepeating(t, defaultRule(k === 'after' ? 'day' : k, start, k === 'after'), ctx.all);
    } else {
      void set(k === 'after' ? { type: 'afterCompletion' } : { type: 'schedule', unit: k });
    }
  };
  const num = (v: string, min = 1) => Math.max(min, Math.floor(Number(v)) || min);
  const ends = rule?.endDate ? 'date' : rule?.count ? 'count' : 'never';

  return (
    <Sheet open={open} onClose={onClose} title="Repeat" action={<button className="text-btn" onClick={onClose}>Done</button>}>
      <div className="segmented">
        {(['never', 'day', 'week', 'month', 'year', 'after'] as RepeatKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => void changeKind(k)}>
            {{ never: 'Never', day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly', after: 'After done' }[k]}
          </button>
        ))}
      </div>
      {rule && (
        <div className="form">
          <label className="form-row">
            <span>Every</span>
            <span className="form-control">
              <input className="num-input" type="number" inputMode="numeric" min={1} value={rule.every} onChange={(e) => set({ every: num(e.target.value) })} />
              {rule.type === 'afterCompletion' ? (
                <select className="select" value={rule.unit} onChange={(e) => set({ unit: e.target.value as RepeatRule['unit'] })}>
                  <option value="day">days</option>
                  <option value="week">weeks</option>
                  <option value="month">months</option>
                  <option value="year">years</option>
                </select>
              ) : (
                <span>{rule.unit}{rule.every > 1 ? 's' : ''}</span>
              )}
            </span>
          </label>
          {rule.type === 'schedule' && rule.unit === 'week' && (
            <div className="form-row">
              <span>On</span>
              <span className="weekday-pills">
                {WEEKDAYS.map((w, i) => {
                  const on = rule.weekdays?.includes(i);
                  return (
                    <button key={w} className={on ? 'on' : ''} onClick={() => {
                      const next = on ? (rule.weekdays ?? []).filter((x) => x !== i) : [...(rule.weekdays ?? []), i];
                      if (next.length) void set({ weekdays: next });
                    }}>{w.slice(0, 2)}</button>
                  );
                })}
              </span>
            </div>
          )}
          {rule.type === 'schedule' && rule.unit === 'month' && (
            <label className="form-row">
              <span>On</span>
              <span className="form-control">
                <select
                  className="select"
                  value={rule.monthMode === 'weekday' ? `w:${rule.ordinal}` : `d:${rule.monthDay}`}
                  onChange={(e) => {
                    const [mode, n] = e.target.value.split(':');
                    void set(mode === 'w' ? { monthMode: 'weekday', ordinal: Number(n) } : { monthMode: 'day', monthDay: Number(n) });
                  }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={`d:${d}`}>the {ordinalLabel(d)}</option>)}
                  <option value="d:-1">the last day</option>
                  {[1, 2, 3, 4, -1].map((o) => <option key={o} value={`w:${o}`}>the {ordinalLabel(o)}…</option>)}
                </select>
                {rule.monthMode === 'weekday' && (
                  <select className="select" value={rule.weekday ?? 0} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                  </select>
                )}
              </span>
            </label>
          )}
          <label className="form-row">
            <span>{rule.type === 'afterCompletion' ? 'First' : 'Starts'}</span>
            <input className="date-input" type="date" value={rule.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
          </label>
          <label className="form-row">
            <span>Ends</span>
            <span className="form-control">
              <select className="select" value={ends} onChange={(e) => set(
                e.target.value === 'date' ? { endDate: addDays(ctx.today, 30), count: null }
                  : e.target.value === 'count' ? { count: 10, endDate: null }
                    : { endDate: null, count: null },
              )}>
                <option value="never">Never</option>
                <option value="date">On date</option>
                <option value="count">After</option>
              </select>
              {ends === 'date' && <input className="date-input" type="date" value={rule.endDate ?? ''} onChange={(e) => e.target.value && set({ endDate: e.target.value })} />}
              {ends === 'count' && <><input className="num-input" type="number" inputMode="numeric" min={1} value={rule.count ?? 1} onChange={(e) => set({ count: num(e.target.value) })} /><span>times</span></>}
            </span>
          </label>
          <label className="form-row">
            <span>Deadline</span>
            <span className="form-control">
              <input
                className="num-input"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="–"
                value={rule.deadlineDays ?? ''}
                onChange={(e) => set({ deadlineDays: e.target.value === '' ? null : num(e.target.value, 0) })}
              />
              <span>days after start</span>
            </span>
          </label>
          <p className="repeat-summary">{describe(rule)}</p>
        </div>
      )}
    </Sheet>
  );
}
