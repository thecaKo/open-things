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

  // Percentages, not px: they are relative to the transition snapshot itself, whose
  // internal scale differs between engines (Electron on a 2× Mac display halved px
  // coordinates, so the circle started away from the tapped control).
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = origin?.x ?? w / 2;
  const y = origin?.y ?? h / 2;
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const at = `at ${(x / w) * 100}% ${(y / h) * 100}%`;
  const end = (radius / (Math.hypot(w, h) / Math.SQRT2)) * 100; // circle() % is of √((w²+h²)/2)
  const transition = doc.startViewTransition(apply);
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0% ${at})`, `circle(${end}% ${at})`] },
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
