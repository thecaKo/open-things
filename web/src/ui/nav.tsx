// Lists screen (phone home) / sidebar (wide): Things' list of lists + Quick Find.
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { LISTS, counts, search, listOf, type Ctx, type ListKind, type View } from '../model';
import { getSyncState, subscribeSync } from '../sync';
import type { Task } from '../db';
import {
  InboxIcon, StarIcon, CalendarIcon, AnytimeIcon, SomedayIcon, LogbookIcon, TrashIcon, AreaIcon, SearchIcon, GearIcon, PlusIcon, CloseIcon,
} from './icons';
import { ProgressPie } from './rows';

export const LIST_ICON: Record<ListKind, { icon: (p: { size?: number }) => ReactNode; color: string }> = {
  inbox: { icon: InboxIcon, color: 'var(--inbox)' },
  today: { icon: StarIcon, color: 'var(--today)' },
  upcoming: { icon: CalendarIcon, color: 'var(--upcoming)' },
  anytime: { icon: AnytimeIcon, color: 'var(--anytime)' },
  someday: { icon: SomedayIcon, color: 'var(--someday)' },
  logbook: { icon: LogbookIcon, color: 'var(--logbook)' },
  trash: { icon: TrashIcon, color: 'var(--trash)' },
};

export function Navigator({ view, ctx, onOpen, onSettings, onNewList, onFound }: {
  view: View;
  ctx: Ctx;
  onOpen: (v: View) => void;
  onSettings: () => void;
  onNewList: () => void;
  onFound: (t: Task) => void;
}) {
  const [q, setQ] = useState('');
  const c = counts(ctx);
  const active = (v: View) => v.kind === view.kind && ('id' in v ? 'id' in view && v.id === view.id : true);
  const projectsOf = (areaId: string | null) => ctx.projects.filter((p) => (p.areaId ?? null) === areaId);
  const results = search(ctx, q);

  const Item = ({ v, icon, color, label, count, bold }: { v: View; icon: ReactNode; color?: string; label: string; count?: number; bold?: boolean }) => (
    <motion.button whileTap={{ backgroundColor: 'var(--press)' }} className={'nav-item' + (active(v) ? ' active' : '') + (bold ? ' bold' : '')} onClick={() => onOpen(v)}>
      <span className="nav-icon" style={{ color }}>{icon}</span>
      <span className="nav-label">{label}</span>
      {!!count && <span className={'nav-count' + (v.kind === 'today' ? ' today' : '')}>{count}</span>}
    </motion.button>
  );
  const listItem = (kind: ListKind) => {
    const { icon: Icon, color } = LIST_ICON[kind];
    return <Item key={kind} v={{ kind }} icon={<Icon size={22} />} color={color} label={LISTS.find((l) => l.kind === kind)!.label} count={(c as Record<string, number>)[kind]} />;
  };
  const projectItem = (p: Task) => (
    <Item key={p.id} v={{ kind: 'project', id: p.id }} icon={<ProgressPie p={p} ctx={ctx} size={19} />} color="var(--accent)" label={p.title || 'New Project'} />
  );

  return (
    <nav className="nav">
      <div className="nav-scroll">
        <label className="search">
          <SearchIcon size={18} />
          <input placeholder="Quick Find" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {q && <button className="icon-btn small" onClick={() => setQ('')} aria-label="Clear search"><CloseIcon size={16} /></button>}
        </label>

        {q ? (
          <div className="search-results">
            {results.lists.map((r) => (
              <Item key={JSON.stringify(r.view)} v={r.view} label={r.label}
                icon={r.view.kind === 'area' ? <AreaIcon size={22} /> : (() => { const { icon: I } = LIST_ICON[r.view.kind as ListKind]; return <I size={22} />; })()}
                color={r.view.kind === 'area' ? 'var(--area)' : LIST_ICON[r.view.kind as ListKind].color} />
            ))}
            {results.tasks.map((t) => (
              <motion.button key={t.id} whileTap={{ backgroundColor: 'var(--press)' }} className="nav-item result" onClick={() => { setQ(''); onFound(t); }}>
                <span className="nav-icon">{t.kind === 'project' ? <ProgressPie p={t} ctx={ctx} size={19} /> : <span className={'mini-check' + (t.status !== 'open' ? ' checked' : '')} />}</span>
                <span className="nav-label">
                  {t.title || 'Untitled'}
                  <small>{describeList(listOf(t, ctx), ctx)}</small>
                </span>
              </motion.button>
            ))}
            {!results.lists.length && !results.tasks.length && <p className="muted center">No results</p>}
          </div>
        ) : (
          <>
            <div className="nav-group">{listItem('inbox')}</div>
            <div className="nav-group">{(['today', 'upcoming', 'anytime', 'someday'] as ListKind[]).map(listItem)}</div>
            <div className="nav-group">{(['logbook', 'trash'] as ListKind[]).map(listItem)}</div>
            {projectsOf(null).length > 0 && <div className="nav-group">{projectsOf(null).map(projectItem)}</div>}
            {ctx.areas.map((a) => (
              <div className="nav-group" key={a.id}>
                <Item v={{ kind: 'area', id: a.id }} icon={<AreaIcon size={22} />} color="var(--area)" label={a.title || 'New Area'} bold />
                {projectsOf(a.id).map(projectItem)}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="nav-footer">
        <motion.button whileTap={{ scale: 0.95 }} className="text-btn" onClick={onNewList}><PlusIcon size={18} /> New List</motion.button>
        <span className="spacer" />
        <SyncDot />
        <motion.button whileTap={{ scale: 0.9 }} className="icon-btn" onClick={onSettings} aria-label="Settings"><GearIcon size={20} /></motion.button>
      </div>
    </nav>
  );
}

function describeList(v: View, ctx: Ctx) {
  if (v.kind === 'project') return ctx.byId.get(v.id)?.title ?? 'Project';
  if (v.kind === 'area') return ctx.areas.find((a) => a.id === v.id)?.title ?? 'Area';
  return LISTS.find((l) => l.kind === v.kind)?.label ?? '';
}

function SyncDot() {
  const { state, lastError } = useSyncExternalStore(subscribeSync, getSyncState);
  const label = { local: 'Local only', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error' }[state];
  return <span className={'sync-dot ' + state} title={lastError || label}><span />{state !== 'synced' && label}</span>;
}
