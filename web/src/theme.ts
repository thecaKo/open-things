// Light / dark / follow-system appearance, per device (localStorage).
// index.html applies the stored choice before first paint; this module keeps it in
// sync with the OS, the Android system bars and the macOS window.
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isNative } from './update';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

let pref: ThemePref = (localStorage.getItem(KEY) as ThemePref) || 'system';
const subscribers = new Set<() => void>();
export const getThemePref = () => pref;
export const subscribeTheme = (fn: () => void) => (subscribers.add(fn), () => void subscribers.delete(fn));
export const resolvedTheme = (): 'light' | 'dark' => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);
/** Store snapshot covering both the choice and the effective theme (OS changes under 'system'). */
export const getThemeSnapshot = () => `${pref}:${resolvedTheme()}`;

const desktop = (window as unknown as { openThingsDesktop?: { setTheme?: (t: ThemePref) => Promise<void> } }).openThingsDesktop;

function apply() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // Status/navigation bar icons: dark on the light theme, light on the dark one.
  if (isNative) void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  // macOS window chrome (traffic lights, vibrancy) follows the same choice.
  void desktop?.setTheme?.(pref);
}

/** Change the appearance; the new theme spreads in a circle from `origin` (the tapped control). */
export function setThemePref(next: ThemePref, origin?: { x: number; y: number }) {
  if (next === pref) return;
  const before = resolvedTheme();
  pref = next;
  localStorage.setItem(KEY, next);
  subscribers.forEach((fn) => fn());

  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce || before === resolvedTheme()) return apply();

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(apply);
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

export function initTheme() {
  apply();
  media.addEventListener('change', () => {
    if (pref === 'system') {
      apply();
      subscribers.forEach((fn) => fn());
    }
  });
}
