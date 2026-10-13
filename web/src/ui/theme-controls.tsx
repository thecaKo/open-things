// Appearance controls: segmented Auto / Light / Dark (Settings) and a quick
// sun/moon toggle (lists footer). Both reveal the new theme from the tap point.
import { useSyncExternalStore, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getThemePref, getThemeSnapshot, setThemePref, subscribeTheme, resolvedTheme, type ThemePref } from '../theme';
import { SunIcon, MoonLineIcon, AutoThemeIcon } from './icons';

const origin = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });
const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Auto', icon: <AutoThemeIcon size={17} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={17} /> },
  { value: 'dark', label: 'Dark', icon: <MoonLineIcon size={17} /> },
];

export function ThemeSegmented() {
  useSyncExternalStore(subscribeTheme, getThemeSnapshot);
  const pref = getThemePref();
  return (
    <div className="segmented-control" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button key={o.value} role="radio" aria-checked={pref === o.value} className={pref === o.value ? 'on' : ''}
          onClick={(e) => setThemePref(o.value, origin(e))}>
          {pref === o.value && (
            <motion.span layoutId="theme-thumb" className="segmented-thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
          )}
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One-tap light/dark switch; the icon rotates between sun and moon. */
export function ThemeToggle() {
  useSyncExternalStore(subscribeTheme, getThemeSnapshot);
  const dark = resolvedTheme() === 'dark';
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      className="icon-btn theme-toggle"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={(e) => setThemePref(dark ? 'light' : 'dark', origin(e))}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={dark ? 'moon' : 'sun'}
          style={{ display: 'grid' }}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
          {dark ? <MoonLineIcon size={20} /> : <SunIcon size={20} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
