// Expanded to-do card (Things: tap a to-do to open it in place).
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { updateTask, uid, type Task } from '../db';
import { daysLeft, parse } from '../dates';
import type { Ctx } from '../model';
import { describe, stopRepeating } from '../repeat';
import { useBack } from './back';
import { Check } from './rows';
import { Sheet, ActionList, Action } from './Sheet';
import { WhenSheet, DeadlineSheet, TagsSheet, MoveSheet, RepeatSheet, whenInfo, liveTemplate, type SheetKind } from './pickers';
import { CalendarIcon, TagIcon, ChecklistIcon, FlagIcon, MoreIcon, RepeatIcon, MoveIcon, TrashIcon, CloseIcon, CheckIcon } from './icons';

export function TaskEditor({ t, ctx, onClose }: { t: Task; ctx: Ctx; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [checklistOpen, setChecklistOpen] = useState(t.checklist.length > 0);
  const latest = useRef({ title, notes, t });
  latest.current = { title, notes, t };
  useBack(true, onClose);

  // Bring the opened card fully into view (after the expand animation starts).
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120);
    return () => clearTimeout(id);
  }, []);

  // Persist on unmount (closing, switching task, navigating away).
  useEffect(() => () => {
    const { title, notes, t } = latest.current;
    if (title !== t.title || notes !== t.notes) void updateTask(t.id, { title, notes });
  }, []);

  // Tap outside the card closes it (sheets and other rows excluded).
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(el) && !el.closest('.sheet-layer, .task, .fab, .topbar')) onClose();
    };
    const id = setTimeout(() => document.addEventListener('pointerdown', handler));
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', handler); };
  }, [onClose]);

  const commit = () => {
    if (title !== t.title || notes !== t.notes) void updateTask(t.id, { title, notes });
  };
  const when = whenInfo(t, ctx.today);
  const tpl = liveTemplate(t, ctx);
  const tags = t.tagIds.map((id) => ctx.tagById.get(id)).filter((x) => x && !x.deleted);
  const close = () => setSheet(null);

  return (
    <motion.div
      ref={ref}
      className="task-card"
      initial={{ opacity: 0.4, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 380 }}
    >
      <div className="card-top">
        {t.repeat ? <span className="repeat-mark"><RepeatIcon size={18} /></span> : <Check t={t} />}
        <input
          className="title-input"
          autoFocus={!t.title}
          placeholder="New To-Do"
          value={title}
          enterKeyHint="done"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit(); onClose(); } }}
        />
      </div>
      <AutoTextarea className="notes-input" placeholder="Notes" value={notes} onChange={setNotes} onBlur={commit} />
      {checklistOpen && <Checklist t={t} autoFocus={t.checklist.length === 0} />}
      {tags.length > 0 && (
        <div className="card-tags" onClick={() => setSheet('tags')}>
          {tags.map((tag) => <span key={tag!.id} className="tag">{tag!.title}</span>)}
        </div>
      )}
      {t.repeat && <p className="card-note">Repeating template: changes apply to future copies.</p>}
      <div className="card-bar">
        <div className="chips">
          {when && !t.repeat && (
            <button className={'chip ' + when.cls} onClick={() => setSheet('when')}>{when.icon}{when.label}</button>
          )}
          {t.deadline && !t.repeat && (
            <button className={'chip deadline' + (t.deadline <= ctx.today ? ' overdue' : '')} onClick={() => setSheet('deadline')}>
              <FlagIcon size={13} />
              {parse(t.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {daysLeft(t.deadline)}
            </button>
          )}
          {tpl && <button className="chip repeat" onClick={() => setSheet('repeat')}><RepeatIcon size={13} />{describe(tpl.repeat!)}</button>}
        </div>
        <div className="card-tools">
          {!t.repeat && <ToolBtn label="When" onClick={() => setSheet('when')}><CalendarIcon /></ToolBtn>}
          <ToolBtn label="Tags" onClick={() => setSheet('tags')}><TagIcon /></ToolBtn>
          <ToolBtn label="Checklist" onClick={() => setChecklistOpen(true)}><ChecklistIcon /></ToolBtn>
          {!t.repeat && <ToolBtn label="Deadline" onClick={() => setSheet('deadline')}><FlagIcon /></ToolBtn>}
          <ToolBtn label="More" onClick={() => setSheet('more')}><MoreIcon /></ToolBtn>
        </div>
      </div>

      <WhenSheet t={t} ctx={ctx} open={sheet === 'when'} onClose={close} />
      <DeadlineSheet t={t} ctx={ctx} open={sheet === 'deadline'} onClose={close} />
      <TagsSheet t={t} ctx={ctx} open={sheet === 'tags'} onClose={close} />
      <MoveSheet t={t} ctx={ctx} open={sheet === 'move'} onClose={close} />
      <RepeatSheet t={t} ctx={ctx} open={sheet === 'repeat'} onClose={close} />
      <Sheet open={sheet === 'more'} onClose={close}>
        <ActionList>
          <Action icon={<RepeatIcon />} color="var(--accent)" label="Repeat…" detail={tpl ? describe(tpl.repeat!) : null} onClick={() => setSheet('repeat')} />
          <Action icon={<MoveIcon />} color="var(--accent)" label="Move…" onClick={() => setSheet('move')} />
          {!t.repeat && t.status === 'open' && (
            <Action icon={<CloseIcon />} label="Mark as Canceled" onClick={() => { void updateTask(t.id, { status: 'canceled', completedAt: Date.now() }); close(); }} />
          )}
          {t.status !== 'open' && (
            <Action icon={<CheckIcon />} label="Mark as Open" onClick={() => { void updateTask(t.id, { status: 'open', completedAt: null }); close(); }} />
          )}
        </ActionList>
        <ActionList>
          {t.repeat ? (
            <Action icon={<TrashIcon />} danger label="Stop Repeating" onClick={async () => {
              if (!confirm('Stop repeating? Copies already created are kept.')) return;
              await stopRepeating(t.id, ctx.all);
              close();
              onClose();
            }} />
          ) : (
            <Action icon={<TrashIcon />} danger label="Delete To-Do" onClick={() => { void updateTask(t.id, { trashed: true }); close(); onClose(); }} />
          )}
        </ActionList>
      </Sheet>
    </motion.div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button className="tool-btn" aria-label={label} title={label} whileTap={{ scale: 0.85 }} onClick={onClick}>
      {children}
    </motion.button>
  );
}

export function AutoTextarea({ value, onChange, onBlur, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
}

function Checklist({ t, autoFocus }: { t: Task; autoFocus: boolean }) {
  const [draft, setDraft] = useState('');
  const set = (checklist: Task['checklist']) => updateTask(t.id, { checklist });
  return (
    <div className="checklist">
      {t.checklist.map((item) => (
        <motion.div className="cl-item" key={item.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <motion.button
            whileTap={{ scale: 0.8 }}
            className={'cl-check' + (item.done ? ' checked' : '')}
            onClick={() => set(t.checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)))}
            aria-label="Toggle item"
          />
          <input
            className={item.done ? 'done' : ''}
            defaultValue={item.title}
            onBlur={(e) => e.target.value !== item.title && set(t.checklist.map((c) => (c.id === item.id ? { ...c, title: e.target.value } : c)))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="icon-btn small" aria-label="Remove item" onClick={() => set(t.checklist.filter((c) => c.id !== item.id))}><CloseIcon size={14} /></button>
        </motion.div>
      ))}
      <div className="cl-item new">
        <span className="cl-check" />
        <input
          autoFocus={autoFocus}
          placeholder="Add item"
          value={draft}
          enterKeyHint="next"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              void set([...t.checklist, { id: uid(), title: draft.trim(), done: false }]);
              setDraft('');
            }
          }}
        />
      </div>
    </div>
  );
}
