// Launch animation: the Open Things mascot (a white rounded square with eyes)
// looks around, a checkbox pops up below it, the mascot looks down at it, the
// checkbox gets checked, and the mascot turns happy and hops. The mascot's first
// frame and position match the native Android splash (res/drawable/
// splash_mascot.xml), so the hand-over is seamless.
import { useEffect } from 'react';
import { motion, useAnimate } from 'motion/react';

const INK = '#141416';
const BLUE = '#3d8bff';
// Scale/blink around each shape's own centre (SVG defaults to the canvas origin).
const own = { transformBox: 'fill-box', transformOrigin: 'center' } as const;

export function Splash({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await animate([
        // look left, look right, back to centre, blink
        ['.eyes', { x: -9 }, { duration: 0.24, delay: 0.25, ease: 'easeOut' }],
        ['.eyes', { x: 9 }, { duration: 0.3, ease: 'easeInOut', at: '+0.16' }],
        ['.eyes', { x: 0 }, { duration: 0.2, ease: 'easeOut', at: '+0.14' }],
        ['.eye', { scaleY: [1, 0.12, 1] }, { duration: 0.2, at: '+0.02' }],
        // a checkbox pops up below; the mascot looks down at it
        ['.checkbox', { opacity: [0, 1], scale: [0.2, 1.12, 1], y: [-18, 0] }, { duration: 0.42, ease: 'easeOut', at: '+0.08' }],
        ['.eyes', { y: 6 }, { duration: 0.22, ease: 'easeOut', at: '-0.2' }],
        // it gets checked: press, turn blue, the check mark draws itself
        ['.checkbox', { scale: [1, 0.86, 1] }, { duration: 0.26, ease: 'easeInOut', at: '+0.2' }],
        ['.box', { fill: BLUE, stroke: BLUE }, { duration: 0.14, at: '-0.16' }],
        ['.tick', { pathLength: [0, 1], opacity: [0, 1] }, { duration: 0.26, ease: [0.3, 0, 0.2, 1], at: '-0.06' }],
        // the mascot is happy and hops
        ['.eye', { opacity: 0 }, { duration: 0.1, at: '-0.04' }],
        ['.eyes', { y: 0 }, { duration: 0.01, at: '<' }],
        ['.happy', { opacity: [0, 1], pathLength: [0, 1] }, { duration: 0.2, at: '<' }],
        ['.body', { scaleX: [1, 1.1, 0.95, 1.02, 1], scaleY: [1, 0.86, 1.08, 0.98, 1], y: [0, 4, -16, 0, 0] }, { duration: 0.55, ease: 'easeOut', at: '<' }],
        ['.checkbox', { y: [0, -5, 0] }, { duration: 0.35, ease: 'easeOut', at: '-0.4' }],
      ]);
      await new Promise((r) => setTimeout(r, 260));
      if (!cancelled) onDone();
    })();
    return () => { cancelled = true; };
  }, [animate, onDone]);

  return (
    <motion.div
      ref={scope}
      className="splash"
      onClick={onDone}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div className="splash-stage" exit={{ scale: 1.2, opacity: 0 }} transition={{ duration: 0.35, ease: 'easeIn' }}>
        <svg className="mascot" viewBox="0 0 120 120" width={120} height={120} aria-label="Open Things">
          <g className="body" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
            <rect x="8" y="8" width="104" height="104" rx="34" fill="#fff" />
            <g className="eyes">
              <ellipse className="eye" cx="44" cy="50" rx="6.5" ry="10" fill={INK} style={own} />
              <ellipse className="eye" cx="76" cy="50" rx="6.5" ry="10" fill={INK} style={own} />
            </g>
            <path className="happy" d="M37 53 Q44 42 51 53" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0" />
            <path className="happy" d="M69 53 Q76 42 83 53" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0" />
          </g>
        </svg>
        <svg className="checkbox" viewBox="0 0 48 48" width={48} height={48} style={{ opacity: 0 }}>
          <rect className="box" x="4" y="4" width="40" height="40" rx="11" fill="rgba(255,255,255,0)" stroke="#fff" strokeWidth="3.5" />
          <path className="tick" d="M14 24.5 L21 31.5 L34 17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0" />
        </svg>
      </motion.div>
    </motion.div>
  );
}
