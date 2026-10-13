// Launch animation: the Open Things mascot (a checkbox with eyes) looks around,
// blinks, "smiles" a blue check mark, gets happy eyes and hops, then hands over to
// the app. The first frame matches the native Android splash (res/drawable/
// splash_mascot.xml): same background, size and position.
import { useEffect } from 'react';
import { motion, useAnimate } from 'motion/react';

const INK = '#141416';
// Scale/blink around each shape's own centre (SVG defaults to the canvas origin).
const own = { transformBox: 'fill-box', transformOrigin: 'center' } as const;

export function Splash({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await animate([
        // look left, look right, back to centre
        ['.eyes', { x: -9 }, { duration: 0.24, delay: 0.25, ease: 'easeOut' }],
        ['.eyes', { x: 9 }, { duration: 0.3, ease: 'easeInOut', at: '+0.18' }],
        ['.eyes', { x: 0 }, { duration: 0.2, ease: 'easeOut', at: '+0.16' }],
        // blink
        ['.eye', { scaleY: [1, 0.12, 1] }, { duration: 0.2, at: '+0.02' }],
        // the check mark is drawn as a smile…
        ['.smile', { pathLength: [0, 1], opacity: [0, 1] }, { duration: 0.34, ease: [0.3, 0, 0.2, 1], at: '+0.08' }],
        // …eyes turn happy and the body hops (squash & stretch)
        ['.eye', { opacity: 0 }, { duration: 0.1, at: '-0.12' }],
        ['.happy', { opacity: [0, 1], pathLength: [0, 1] }, { duration: 0.2, at: '<' }],
        ['.body', { scaleX: [1, 1.1, 0.95, 1.02, 1], scaleY: [1, 0.86, 1.08, 0.98, 1], y: [0, 4, -14, 0, 0] }, { duration: 0.55, ease: 'easeOut', at: '<' }],
      ]);
      await new Promise((r) => setTimeout(r, 220));
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
      <motion.svg
        className="mascot"
        viewBox="0 0 120 120"
        width={120}
        height={120}
        exit={{ scale: 1.25, opacity: 0 }}
        transition={{ duration: 0.35, ease: 'easeIn' }}
        aria-label="Open Things"
      >
        <g className="body" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
          <rect x="8" y="8" width="104" height="104" rx="34" fill="#fff" />
          <g className="eyes">
            <ellipse className="eye" cx="44" cy="50" rx="6.5" ry="10" fill={INK} style={own} />
            <ellipse className="eye" cx="76" cy="50" rx="6.5" ry="10" fill={INK} style={own} />
          </g>
          <path className="happy" d="M37 53 Q44 42 51 53" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0" />
          <path className="happy" d="M69 53 Q76 42 83 53" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0" />
          <path className="smile" d="M40 76 L52 87 L81 64" stroke="var(--accent)" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0" />
        </g>
      </motion.svg>
    </motion.div>
  );
}
