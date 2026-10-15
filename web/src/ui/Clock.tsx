// Ambient clock (Android app only): a full-screen pastel clock with a bold time
// and our mascot peeking up from the bottom edge. The mascot blinks, glances
// around, breathes, hops each minute, sleeps at night and reacts to taps. The
// screen stays on while it is open (Wake Lock) and the system bars are hidden.
// Tap to show the close button; back closes it. In landscape a speech bubble
// above the mascot cycles through today's to-dos. The pomodoro icon (top right)
// opens a focus/break timer on the same screen: the mascot is happy when a focus
// ends and sleeps during breaks; tap it five times in a row there and it gets
// cross and slaps the screen.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { SystemBars } from '@capacitor/core';
import { isNative } from '../update';
import { useBack } from './back';
import { CloseIcon, GearIcon, ChevronLeft, PauseIcon, PlayIcon, ResetIcon, SkipIcon, TomatoIcon } from './icons';
import * as pomo from './pomodoro';

const HOUR12 = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
const pad = (n: number) => String(n).padStart(2, '0');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (a: number, b: number) => a + Math.random() * (b - a);
const HEART = 'M0 5 C-7 0 -8 -5 -4 -7.5 C-2 -8.5 0 -7 0 -5 C0 -7 2 -8.5 4 -7.5 C8 -5 7 0 0 5 Z';
const ZS = [[96, 2, 7], [104, -8, 9], [113, -20, 11]] as const;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 1000 - (Date.now() % 1000) + 5); // land just after each second
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  return now;
}

/** Keep the screen on while mounted; re-acquired when the app comes back to the front. */
function useWakeLock() {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release(): Promise<void> } | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      void nav.wakeLock!.request('screen').then((l) => (alive ? (lock = l) : void l.release())).catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** One digit that blurs/slides softly into the next value. */
function Digit({ d }: { d: string }) {
  return (
    <span className="clock-digit">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={d}
          initial={{ y: '-0.25em', opacity: 0, filter: 'blur(10px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '0.25em', opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const Pair = ({ v }: { v: string }) => (
  <span className="clock-pair"><Digit d={v[0]} /><Digit d={v[1]} /></span>
);

/** Today's to-dos in a speech bubble, one at a time (~3s each); long ones scroll to their end. */
function TodoBubble({ items }: { items: string[] }) {
  const [step, setStep] = useState(0);
  if (!items.length) return null;
  const text = items[step % items.length];
  return (
    <div className="clock-todos" onClick={(e) => e.stopPropagation()}>
      <AnimatePresence mode="wait">
        <TodoLine key={step} text={text} onDone={() => setStep((s) => s + 1)} />
      </AnimatePresence>
    </div>
  );
}

function TodoLine({ text, onDone }: { text: string; onDone: () => void }) {
  const box = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const [scope, animate] = useAnimate();
  const [long, setLong] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const overflow = line.current!.scrollWidth - box.current!.clientWidth;
      setLong(overflow > 0);
      await wait(1000); // read the start first
      if (!alive) return;
      if (overflow > 0) {
        await animate(line.current!, { x: -overflow - 4 }, { duration: overflow / 50, ease: 'linear' });
        await wait(1200);
      } else {
        await wait(2000);
      }
      if (alive) done.current();
    })();
    return () => { alive = false; };
  }, [text, animate]);

  return (
    <motion.div
      ref={scope}
      className="clock-bubble"
      initial={{ opacity: 0, y: 10, scale: 0.94, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, scale: 0.97, filter: 'blur(6px)' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <span ref={box} className={'clock-bubble-box' + (long ? ' long' : '')}>
        <span ref={line} className="clock-bubble-text">{text}</span>
      </span>
    </motion.div>
  );
}

type Mood = 'open' | 'happy' | 'sleep' | 'angry';

/** The mascot peeking up from the bottom edge, with a little idle life. */
function Mascot({ asleep, minute, celebrating = false, onSlap }: { asleep: boolean; minute: number; celebrating?: boolean; onSlap?: () => void }) {
  const [scope, animate] = useAnimate();
  const reduce = useReducedMotion();
  const [happy, setHappy] = useState(false);
  const [angry, setAngry] = useState(false);
  const mood: Mood = angry ? 'angry' : happy || celebrating ? 'happy' : asleep ? 'sleep' : 'open';
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const busy = useRef(false);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turned = useRef(false);
  const taps = useRef({ n: 0, at: 0 });

  const run = async (fn: () => unknown) => {
    busy.current = true;
    try { await fn(); } finally { busy.current = false; }
  };
  const blink = () => animate('.clock-eye', { scaleY: [1, 0.1, 1] }, { duration: 0.22, ease: 'easeInOut' });
  const glance = async (x: number) => {
    await animate('.clock-eyes', { x }, { duration: 0.35, ease: 'easeInOut' });
    await wait(between(700, 1300));
    await animate('.clock-eyes', { x: 0 }, { duration: 0.35, ease: 'easeInOut' });
  };
  const hop = () => animate('.clock-body', { y: [0, -12, 0], scaleY: [1, 1.03, 1] }, { duration: 0.5, ease: 'easeOut' });
  const tilt = () => animate('.clock-body', { rotate: [0, -7, 0] }, { duration: 1.1, ease: 'easeInOut' });
  const squish = () => animate('.clock-body', { scaleX: [1, 1.08, 0.97, 1], scaleY: [1, 0.88, 1.04, 1] }, { duration: 0.5, ease: 'easeOut' });
  const heart = () => animate('.clock-heart', { y: [0, -26], opacity: [0, 1, 0], scale: [0.6, 1, 1] }, { duration: 1.6, ease: 'easeOut' });

  // Happy eyes, a floating heart and a squish. Used by taps and random moments.
  const cheer = () => {
    setHappy(true);
    clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => setHappy(false), 1600);
    if (reduce) return;
    void heart();
    void squish();
  };

  // Fifth quick tap in a row: frown, wind up and slap (the parent draws the hand).
  const rage = () => {
    setHappy(false);
    setAngry(true);
    clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => setAngry(false), 2600);
    if (reduce) return onSlap?.();
    void run(async () => {
      await animate('.clock-body', { rotate: 9, x: 6 }, { duration: 0.22, ease: 'easeOut' });
      onSlap?.();
      await animate('.clock-body', { rotate: [9, -14, 0], x: [6, -10, 0], scale: [1, 1.12, 1] }, { duration: 0.5, ease: 'easeOut' });
    });
  };

  const tap = () => {
    const t = Date.now();
    const n = t - taps.current.at < 700 ? taps.current.n + 1 : 1;
    taps.current = { n: n >= 5 ? 0 : n, at: t };
    if (onSlap && n >= 5) rage();
    else if (!angry) cheer();
  };

  // Idle loop: a blink every few seconds, glances, and a bigger moment every 20-40s.
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    void (async () => {
      let moment = Date.now() + between(20000, 40000);
      while (alive) {
        await wait(between(2200, 4200));
        if (!alive) break;
        if (busy.current) continue;
        if (Date.now() >= moment) {
          moment = Date.now() + between(20000, 40000);
          const r = Math.random();
          if (r < 0.35) await run(hop);
          else if (r < 0.7) cheer();
          else await run(tilt);
        } else if (moodRef.current === 'open') {
          if (Math.random() < 0.6) await run(blink);
          else await run(() => glance(Math.random() < 0.5 ? -4 : 4));
        }
      }
    })();
    return () => { alive = false; };
  }, [reduce]);

  // Celebrating (a focus just ended): keep hopping with a heart every beat.
  useEffect(() => {
    if (!celebrating || reduce) return;
    let alive = true;
    void (async () => {
      while (alive) {
        await run(async () => { void heart(); await hop(); });
        await wait(1100);
      }
    })();
    return () => { alive = false; };
  }, [celebrating, reduce]);

  // A little hop and an upward glance each time the minute turns.
  useEffect(() => {
    if (!turned.current) { turned.current = true; return; }
    if (reduce) return;
    void run(async () => {
      if (moodRef.current === 'open') void animate('.clock-eyes', { y: [0, -3, 0] }, { duration: 0.8, ease: 'easeOut' });
      await hop();
    });
  }, [minute]);

  // Sleepy "z" letters drift up while it is night.
  useEffect(() => {
    if (!asleep || reduce) return;
    const z = animate('.clock-z', { y: [0, -14], opacity: [0, 1, 0] }, { duration: 3, ease: 'easeInOut', repeat: Infinity, delay: stagger(1.1) });
    return () => z.stop();
  }, [asleep, reduce, animate]);

  return (
    <motion.div
      className="clock-mascot"
      initial={{ y: '45%' }}
      animate={{ y: 0 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      onClick={(e) => { e.stopPropagation(); tap(); }}
    >
      <div className={asleep ? 'clock-breathe sleep' : 'clock-breathe'}>
        <svg ref={scope} className={'clock-svg' + (angry ? ' angry' : '')} viewBox="0 0 120 120" role="img" aria-label="Open Things mascot">
          <g className="clock-body">
            <rect className="clock-shape" x="8" y="8" width="104" height="140" rx="34" />
            <g className="clock-eyes">
              {mood === 'open' && (
                <>
                  <ellipse className="clock-eye" cx="44" cy="54" rx="6.5" ry="10" />
                  <ellipse className="clock-eye" cx="76" cy="54" rx="6.5" ry="10" />
                </>
              )}
              {mood === 'sleep' && (
                <>
                  <path className="clock-line" d="M37 56 Q44 63 51 56" />
                  <path className="clock-line" d="M69 56 Q76 63 83 56" />
                </>
              )}
              {mood === 'angry' && (
                <>
                  <path className="clock-line" d="M32 40 L52 48" />
                  <path className="clock-line" d="M88 40 L68 48" />
                  <ellipse className="clock-eye" cx="44" cy="58" rx="6" ry="7" />
                  <ellipse className="clock-eye" cx="76" cy="58" rx="6" ry="7" />
                </>
              )}
              {mood === 'happy' && (
                <>
                  <path className="clock-line" d="M37 58 Q44 46 51 58" />
                  <path className="clock-line" d="M69 58 Q76 46 83 58" />
                </>
              )}
            </g>
            <ellipse className="clock-blush" cx="30" cy="74" rx="7" ry="4.5" />
            <ellipse className="clock-blush" cx="90" cy="74" rx="7" ry="4.5" />
            <path className="clock-mouth" d={angry ? 'M54 80 Q60 73 66 80' : 'M56 74 Q60 79 64 74'} />
          </g>
          <g transform="translate(100 10)"><g className="clock-heart"><path d={HEART} /></g></g>
          {asleep && ZS.map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><text className="clock-z" fontSize={s}>z</text></g>
          ))}
        </svg>
      </div>
    </motion.div>
  );
}

/** Re-renders every `ms`, so the pomodoro countdown and its phase changes show on time. */
function useTicker(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const SLAP_MS = 1100;
const HIT = 0.2; // share of SLAP_MS when the hand lands

/** A big mitten swooping in from the mascot's side, a flash, a "PÁ!" and off it goes. */
function Slap() {
  const ease = { duration: SLAP_MS / 1000, times: [0, HIT, 0.55, 1] };
  return (
    <div className="slap" aria-hidden>
      <motion.div className="slap-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.75, 0] }} transition={{ duration: 0.8, times: [0, 0.27, 0.31, 1] }} />
      <motion.svg
        className="slap-hand"
        viewBox="0 0 100 120"
        initial={{ opacity: 0 }}
        animate={{ x: ['55vw', '0vw', '1vw', '-75vw'], y: ['35vh', '0vh', '2vh', '12vh'], rotate: [55, -12, -6, -45], scale: [0.5, 1.5, 1.4, 1], opacity: [1, 1, 1, 0] }}
        transition={{ ...ease, ease: ['easeIn', 'easeOut', 'easeIn'] }}
      >
        <rect x="-2" y="52" width="40" height="24" rx="12" transform="rotate(-35 18 64)" />
        <rect x="22" y="12" width="64" height="94" rx="32" />
        <path className="slap-finger" d="M42 14 V34 M56 12 V34 M70 14 V34" />
      </motion.svg>
      <motion.div
        className="slap-pow"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.4, 0.4, 1.25, 1, 0.9] }}
        transition={{ duration: 0.9, times: [0, 0.24, 0.32, 0.7, 1] }}
      >
        PÁ!
      </motion.div>
    </div>
  );
}

/** Focus / break timer in the clock's style: time and controls on top, the mascot below. */
function PomodoroView({ onBack }: { onBack: () => void }) {
  const timer = useSyncExternalStore(pomo.subscribe, pomo.getTimer);
  const settings = useSyncExternalStore(pomo.subscribe, pomo.getSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slapAt, setSlapAt] = useState(0);
  const [root, animateRoot] = useAnimate<HTMLDivElement>();
  const now = useTicker(250);
  const closeOrBack = () => (settingsOpen ? setSettingsOpen(false) : onBack());
  useBack(true, closeOrBack);

  useEffect(() => {
    pomo.tick();
  }, [now]);

  const running = timer.status === 'running';
  const celebrating = now < timer.celebrateUntil;
  const breaking = timer.phase === 'break';
  const left = Math.ceil(pomo.remainingMs(timer, settings, now) / 1000);
  const mm = pad(Math.floor(left / 60));
  const ss = pad(left % 60);
  const cycles = settings.cyclesBeforeLong;
  const inCycle = breaking ? ((timer.sessions - 1) % cycles) + 1 : (timer.sessions % cycles) + 1;
  const label = breaking ? (timer.long ? 'Long break' : 'Break') : 'Focus';
  const slapping = now < slapAt + SLAP_MS;
  const scolding = now < slapAt + 2600;
  const slap = () => {
    setSlapAt(Date.now());
    setTimeout(() => {
      try {
        navigator.vibrate?.(120);
      } catch {
        // No vibration here; the shake says enough.
      }
      void animateRoot(root.current, { x: [0, -16, 13, -8, 4, 0], y: [0, 6, -4, 2, 0] }, { duration: 0.45, ease: 'easeOut' });
    }, SLAP_MS * HIT);
  };
  const say = scolding
    ? 'Mais focus!'
    : celebrating
    ? 'Great focus! Time for a break!'
    : breaking
      ? running ? 'Shh… resting' : timer.status === 'paused' ? 'Still resting…' : 'Zzz… break time'
      : running ? 'Focus, you got this!' : timer.status === 'paused' ? 'Paused, no rush.' : 'Ready when you are.';

  return (
    <motion.div
      ref={root}
      className="pomo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pomo-top">
        <motion.button whileTap={{ scale: 0.9 }} className="clock-round" aria-label="Back" onClick={closeOrBack}>
          <ChevronLeft size={22} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} className="clock-round" aria-label="Pomodoro settings" onClick={() => setSettingsOpen((o) => !o)}>
          <GearIcon size={20} />
        </motion.button>
      </div>

      <div className="pomo-main">
        <div className="pomo-label">{label} · {inCycle} of {cycles}</div>
        <div className="clock-time" role="timer" aria-label={`${mm}:${ss} left`}>
          <Pair v={mm} />
          <span className="clock-colon" aria-hidden><i /><i /></span>
          <Pair v={ss} />
        </div>
        <div className="pomo-controls">
          <motion.button whileTap={{ scale: 0.9 }} className="clock-round" aria-label="Reset" onClick={pomo.reset}>
            <ResetIcon size={22} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.92 }} className="pomo-play" aria-label={running ? 'Pause' : breaking ? 'Start break' : 'Start focus'} onClick={() => (running ? pomo.pause() : pomo.start())}>
            {running ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} className="clock-round" aria-label="Skip" onClick={pomo.skip}>
            <SkipIcon size={22} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={say}
          className="pomo-say"
          initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="clock-bubble">{say}</div>
        </motion.div>
      </AnimatePresence>

      <Mascot asleep={breaking && !celebrating} minute={0} celebrating={celebrating} onSlap={slap} />
      {slapping && <Slap key={slapAt} />}

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="pomo-settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="pomo-rows">
              <div className="pomo-title">Pomodoro</div>
              {pomo.FIELDS.map((f) => (
                <div className="pomo-row" key={f.key}>
                  <span>{f.label}</span>
                  <span className="pomo-step">
                    <button aria-label={`Less ${f.label}`} disabled={settings[f.key] <= f.min} onClick={() => pomo.bump(f.key, -1)}>−</button>
                    <b>{settings[f.key]}{f.unit && <small> {f.unit}</small>}</b>
                    <button aria-label={`More ${f.label}`} disabled={settings[f.key] >= f.max} onClick={() => pomo.bump(f.key, 1)}>+</button>
                  </span>
                </div>
              ))}
              <div className="pomo-row">
                <span>Start breaks automatically</span>
                <button
                  role="switch"
                  aria-checked={settings.autoStartBreak}
                  className={'pomo-toggle' + (settings.autoStartBreak ? ' on' : '')}
                  onClick={pomo.toggleAutoStart}
                >
                  <span />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ClockScreen({ todos, onClose }: { todos: string[]; onClose: () => void }) {
  const now = useNow();
  const [chrome, setChrome] = useState(false);
  const [pomodoro, setPomodoro] = useState(false);
  useBack(true, onClose);
  useWakeLock();

  useEffect(() => {
    if (!isNative) return;
    void SystemBars.hide().catch(() => {});
    return () => void SystemBars.show().catch(() => {});
  }, []);

  // The close button shows on tap and fades away again after a few seconds.
  useEffect(() => {
    if (!chrome) return;
    const id = setTimeout(() => setChrome(false), 3500);
    return () => clearTimeout(id);
  }, [chrome]);

  const h = now.getHours();
  const hours = pad(HOUR12 ? h % 12 || 12 : h);
  const minutes = pad(now.getMinutes());
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const meridiem = HOUR12 ? (h < 12 ? 'AM' : 'PM') : null;
  const asleep = h >= 22 || h < 6;

  return (
    <motion.div
      className="clock"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onClick={() => setChrome((c) => !c)}
    >
      {pomodoro ? (
        <PomodoroView onBack={() => setPomodoro(false)} />
      ) : (
        <>
          <motion.div
            className="clock-face"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            <div className="clock-time" role="timer" aria-label={`${hours}:${minutes}`}>
              <Pair v={hours} />
              <span className="clock-colon" aria-hidden><i /><i /></span>
              <Pair v={minutes} />
            </div>
            <div className="clock-date">{date}{meridiem && <> · {meridiem}</>}</div>
          </motion.div>

          <Mascot asleep={asleep} minute={now.getMinutes()} />
          <TodoBubble items={todos} />

          <div className="clock-tools">
            <AnimatePresence>
              {chrome && (
                <motion.button
                  key="close"
                  className="clock-round"
                  aria-label="Close clock"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                >
                  <CloseIcon size={20} />
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              whileTap={{ scale: 0.9 }}
              className="clock-round"
              aria-label="Pomodoro"
              onClick={(e) => { e.stopPropagation(); setPomodoro(true); }}
            >
              <TomatoIcon size={22} />
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}
