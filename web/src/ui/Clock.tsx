// Ambient clock (Android app only): a full-screen pastel clock with a bold time
// and our mascot peeking up from the bottom edge. The mascot blinks, glances
// around, breathes, hops each minute, sleeps at night and reacts to taps. The
// screen stays on while it is open (Wake Lock) and the system bars are hidden.
// Tap to show the close button; back closes it. In landscape a speech bubble
// above the mascot cycles through today's to-dos.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { SystemBars } from '@capacitor/core';
import { isNative } from '../update';
import { useBack } from './back';
import { CloseIcon } from './icons';

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

type Mood = 'open' | 'happy' | 'sleep';

/** The mascot peeking up from the bottom edge, with a little idle life. */
function Mascot({ asleep, minute }: { asleep: boolean; minute: number }) {
  const [scope, animate] = useAnimate();
  const reduce = useReducedMotion();
  const [happy, setHappy] = useState(false);
  const mood: Mood = happy ? 'happy' : asleep ? 'sleep' : 'open';
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const busy = useRef(false);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turned = useRef(false);

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
      onClick={(e) => { e.stopPropagation(); cheer(); }}
    >
      <div className={asleep ? 'clock-breathe sleep' : 'clock-breathe'}>
        <svg ref={scope} className="clock-svg" viewBox="0 0 120 120" role="img" aria-label="Open Things mascot">
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
              {mood === 'happy' && (
                <>
                  <path className="clock-line" d="M37 58 Q44 46 51 58" />
                  <path className="clock-line" d="M69 58 Q76 46 83 58" />
                </>
              )}
            </g>
            <ellipse className="clock-blush" cx="30" cy="74" rx="7" ry="4.5" />
            <ellipse className="clock-blush" cx="90" cy="74" rx="7" ry="4.5" />
            <path className="clock-mouth" d="M56 74 Q60 79 64 74" />
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

export function ClockScreen({ todos, onClose }: { todos: string[]; onClose: () => void }) {
  const now = useNow();
  const [chrome, setChrome] = useState(false);
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

      <AnimatePresence>
        {chrome && (
          <motion.button
            className="clock-close"
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
    </motion.div>
  );
}
