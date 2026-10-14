// Ambient clock (Android app only): a full-screen, soft clock to leave on the
// screen. Hours over minutes in portrait, side by side in landscape; drifting
// pastel light behind, a slim seconds line, the date. The screen stays on while
// it is open (Wake Lock) and the system bars are hidden. Tap to show the close
// button; back closes it.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SystemBars } from '@capacitor/core';
import { isNative } from '../update';
import { useBack } from './back';
import { CloseIcon } from './icons';

const HOUR12 = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');
const pad = (n: number) => String(n).padStart(2, '0');

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

export function ClockScreen({ onClose }: { onClose: () => void }) {
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

  return (
    <motion.div
      className="clock"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onClick={() => setChrome((c) => !c)}
    >
      <div className="clock-glow" aria-hidden>
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <motion.div
        className="clock-face"
        initial={{ scale: 0.96, opacity: 0, filter: 'blur(12px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        <div className="clock-time" role="timer" aria-label={`${hours}:${minutes}`}>
          <Pair v={hours} />
          <span className="clock-colon" aria-hidden><i /><i /></span>
          <Pair v={minutes} />
        </div>
        <div className="clock-meta">
          <span className="clock-date">{date}{meridiem && <> · {meridiem}</>}</span>
          <span className="clock-seconds" aria-hidden>
            <span style={{ transform: `scaleX(${(now.getSeconds() + 1) / 60})` }} className={now.getSeconds() === 0 ? 'reset' : ''} />
          </span>
        </div>
      </motion.div>

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
