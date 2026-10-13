// Month grid like Things' date picker: today shows a star, past days are dimmed.
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fmt, parse } from '../dates';
import { ChevronLeft, ChevronRight, StarIcon } from './icons';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Calendar({ value, today, onPick, allowPast = false }: {
  value: string | null;
  today: string;
  onPick: (d: string) => void;
  allowPast?: boolean;
}) {
  const initial = parse(value && value >= today ? value : today);
  const [month, setMonth] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const [dir, setDir] = useState(0);
  const first = new Date(month.y, month.m, 1);
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: new Date(month.y, month.m + 1, 0).getDate() }, (_, i) => fmt(new Date(month.y, month.m, i + 1))),
  ];
  const shift = (n: number) => {
    setDir(n);
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <span>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="cal-grid cal-week">{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={`${month.y}-${month.m}`}
          className="cal-grid"
          custom={dir}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -40 }}
          transition={{ duration: 0.18 }}
        >
          {cells.map((d, i) =>
            d ? (
              <button
                key={d}
                disabled={!allowPast && d < today}
                className={'cal-day' + (d === value ? ' selected' : '') + (d === today ? ' today' : '')}
                onClick={() => onPick(d)}
              >
                {d === today && d !== value ? <StarIcon size={16} /> : parse(d).getDate()}
              </button>
            ) : (
              <span key={`e${i}`} />
            ),
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
