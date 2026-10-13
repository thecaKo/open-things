import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createTask, createArea, type Task } from './db';
import { getConfig } from './sync';
import { todayStr } from './dates';
import { isNative, isApp, getPendingUpdate, subscribeUpdate, applyUpdate } from './update';
import { SplashScreen } from '@capacitor/splash-screen';
import { runRepeats } from './repeat';
import { buildCtx, listOf, subscribeLinger, getLingerVersion, type View } from './model';
import { useBack } from './ui/back';
import { useWide } from './ui/hooks';
import { Splash } from './ui/Splash';
import { Navigator } from './ui/nav';
import { ListScreen } from './ui/screen';
import { SettingsSheet } from './ui/settings';
import { Sheet, ActionList, Action } from './ui/Sheet';
import { AreaIcon } from './ui/icons';
import { ProgressPie } from './ui/rows';

const initialView = (): View => {
  try {
    return JSON.parse(localStorage.getItem('view') ?? '') as View;
  } catch {
    return { kind: 'today' };
  }
};

// Phone: screens slide like a navigation stack. dir 1 = push, -1 = pop.
const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-25%', opacity: dir > 0 ? 1 : 0.6 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-25%' : '100%', opacity: dir > 0 ? 0.6 : 1 }),
};

/** Root: the app plus the launch animation on top (kept outside App so it never remounts). */
export default function Root() {
  // Phones only; skipped on wide screens and with reduced motion.
  const [splash, setSplash] = useState(
    () => !window.matchMedia('(min-width: 760px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const endSplash = useCallback(() => setSplash(false), []);
  // Drop the native splash once our first frame (identical mascot, or the app) is painted.
  useEffect(() => {
    if (!isNative) return;
    // Two frames + a short margin: rAF can fire before the WebView frame is on screen.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => void SplashScreen.hide({ fadeOutDuration: 0 }), 120)));
  }, []);
  return (
    <>
      <App />
      <AnimatePresence>{splash && <Splash key="splash" onDone={endSplash} />}</AnimatePresence>
    </>
  );
}

function App() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const areas = useLiveQuery(() => db.areas.toArray(), []);
  const tags = useLiveQuery(() => db.tags.toArray(), []);
  useSyncExternalStore(subscribeLinger, getLingerVersion); // re-render when completed items leave
  const wide = useWide();
  const [view, setView] = useState<View>(initialView);
  const [history, setHistory] = useState<View[]>([]);
  const [dir, setDir] = useState(1);
  const [settings, setSettings] = useState(false);
  const [newList, setNewList] = useState(false);
  const [today, setToday] = useState(todayStr());

  useEffect(() => {
    if (isApp) void getConfig().then((c) => !c.token && setSettings(true));
  }, []);

  useEffect(() => {
    const tick = () => { setToday(todayStr()); void runRepeats(); };
    const id = setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(id); window.removeEventListener('focus', tick); };
  }, []);

  const ctx = useMemo(() => buildCtx(tasks ?? [], areas ?? [], tags ?? [], today), [tasks, areas, tags, today]);

  // On wide screens the lists are always visible in the sidebar, so "home" means Today.
  const shownView: View = wide && view.kind === 'home' ? { kind: 'today' } : view;

  const open = (v: View) => {
    if (JSON.stringify(v) === JSON.stringify(shownView)) return;
    setDir(1);
    setHistory((h) => [...h, shownView]);
    setView(v);
    localStorage.setItem('view', JSON.stringify(v));
  };
  const back = () => {
    setDir(-1);
    const prev = history[history.length - 1] ?? { kind: 'home' };
    setHistory((h) => h.slice(0, -1));
    setView(prev);
    localStorage.setItem('view', JSON.stringify(prev));
  };
  useBack(!wide && view.kind !== 'home', back);

  const onFound = (t: Task) => open(listOf(t, ctx));
  const backLabel = (() => {
    const prev = history[history.length - 1];
    if (prev?.kind === 'area') return ctx.areas.find((a) => a.id === prev.id)?.title || 'Area';
    if (prev?.kind === 'project') return ctx.byId.get(prev.id)?.title || 'Project';
    return 'Lists';
  })();

  if (!tasks || !areas || !tags) return <div className="app loading" />;

  const nav = (
    <Navigator view={shownView} ctx={ctx} onOpen={open} onSettings={() => setSettings(true)} onNewList={() => setNewList(true)} onFound={onFound} />
  );
  const screen = (v: View) => (
    <ListScreen key={JSON.stringify(v)} view={v} ctx={ctx} wide={wide} onBack={back} onOpen={open} backLabel={backLabel} />
  );

  return (
    <div className={'app' + (wide ? ' wide' : ' phone')}>
      {wide ? (
        <>
          <aside className="sidebar">{nav}</aside>
          <main className="main">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={JSON.stringify(shownView)}
                className="screen"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {screen(shownView)}
              </motion.div>
            </AnimatePresence>
          </main>
        </>
      ) : (
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={JSON.stringify(view)}
            className="screen"
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', damping: 36, stiffness: 340, mass: 0.9 }}
          >
            {view.kind === 'home' ? nav : screen(view)}
          </motion.div>
        </AnimatePresence>
      )}

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
      <Sheet open={newList} onClose={() => setNewList(false)} title="New List">
        <ActionList>
          <Action
            icon={<ProgressPie p={{ status: 'open' } as Task} ctx={ctx} size={22} />}
            color="var(--accent)"
            label={<span className="action-two">New Project<small>Define a goal, then work towards it one to-do at a time.</small></span>}
            onClick={async () => { setNewList(false); open({ kind: 'project', id: await createTask({ kind: 'project', title: '', start: 'anytime' }) }); }}
          />
          <Action
            icon={<AreaIcon size={22} />}
            color="var(--area)"
            label={<span className="action-two">New Area<small>Group your projects and to-dos by area of responsibility.</small></span>}
            onClick={async () => { setNewList(false); open({ kind: 'area', id: await createArea('') }); }}
          />
        </ActionList>
      </Sheet>
      <UpdateBanner />
    </div>
  );
}

function UpdateBanner() {
  const pending = useSyncExternalStore(subscribeUpdate, getPendingUpdate);
  return (
    <AnimatePresence>
      {pending && (
        <motion.button
          className="update-banner"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          onClick={() => void applyUpdate()}
        >
          New version available · Tap to update
        </motion.button>
      )}
    </AnimatePresence>
  );
}
