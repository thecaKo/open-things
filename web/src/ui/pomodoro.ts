// Pomodoro timer for the ambient clock: persisted settings and the running session.
// Timing is by timestamps (endAt), not by counting ticks, so the countdown stays
// right while the app is in the background. The state lives at module level, so
// leaving the pomodoro view (or the clock) does not stop a running session.

export type NumKey = 'focus' | 'shortBreak' | 'longBreak' | 'cyclesBeforeLong';
export type Settings = Record<NumKey, number> & { autoStartBreak: boolean };

export const DEFAULTS: Settings = { focus: 30, shortBreak: 10, longBreak: 20, cyclesBeforeLong: 4, autoStartBreak: true };

/** Steppers in the settings panel; values are minutes except cyclesBeforeLong (sessions). */
export const FIELDS: { key: NumKey; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'focus', label: 'Focus', min: 10, max: 90, step: 10, unit: 'min' },
  { key: 'shortBreak', label: 'Short break', min: 5, max: 30, step: 5, unit: 'min' },
  { key: 'longBreak', label: 'Long break', min: 15, max: 45, step: 5, unit: 'min' },
  { key: 'cyclesBeforeLong', label: 'Sessions before a long break', min: 2, max: 6, step: 1, unit: '' },
];

export type Timer = {
  phase: 'focus' | 'break';
  long: boolean; // the current break is the long one
  status: 'ready' | 'running' | 'paused';
  endAt: number; // running: timestamp the phase ends
  left: number; // paused: ms left
  sessions: number; // focus sessions finished in this run (skipped ones count too)
  celebrateUntil: number; // mascot is happy until this time (Infinity: until the break starts)
};

const CELEBRATE_MS = 8000;
const fresh = (sessions = 0): Timer => ({ phase: 'focus', long: false, status: 'ready', endAt: 0, left: 0, sessions, celebrateUntil: 0 });

function snap(key: NumKey, v: unknown): number {
  const f = FIELDS.find((x) => x.key === key)!;
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULTS[key];
  return Math.min(f.max, Math.max(f.min, Math.round(v / f.step) * f.step));
}

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro') ?? '{}') as Partial<Record<keyof Settings, unknown>>;
    const s = { ...DEFAULTS, autoStartBreak: typeof saved.autoStartBreak === 'boolean' ? saved.autoStartBreak : DEFAULTS.autoStartBreak };
    for (const f of FIELDS) s[f.key] = snap(f.key, saved[f.key]);
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = loadSettings();
let timer = fresh();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getTimer = () => timer;
export const getSettings = () => settings;

export function durationMs(t: Timer, s: Settings) {
  const min = t.phase === 'focus' ? s.focus : t.long ? s.longBreak : s.shortBreak;
  return min * 60_000;
}

export function remainingMs(t: Timer, s: Settings, now: number) {
  if (t.status === 'running') return Math.max(0, t.endAt - now);
  if (t.status === 'paused') return t.left;
  return durationMs(t, s);
}

function vibrate() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    // Not supported here; the mascot's happy face is the signal.
  }
}

/** The phase after the current one. A finished focus (or a skipped one) leads to a break. */
function next(t: Timer, s: Settings, now: number, celebrate: boolean): Timer {
  if (t.phase === 'focus') {
    const sessions = t.sessions + 1;
    const brk: Timer = { ...fresh(sessions), phase: 'break', long: sessions % s.cyclesBeforeLong === 0 };
    if (s.autoStartBreak) {
      return { ...brk, status: 'running', endAt: now + durationMs(brk, s), celebrateUntil: celebrate ? now + CELEBRATE_MS : 0 };
    }
    return { ...brk, celebrateUntil: celebrate ? Infinity : 0 };
  }
  return fresh(t.sessions);
}

/** Called often by the view; moves on when the running phase has ended. */
export function tick() {
  const now = Date.now();
  if (timer.status !== 'running' || now < timer.endAt) return;
  vibrate();
  timer = next(timer, settings, now, true);
  notify();
}

export function start() {
  if (timer.status === 'running') return;
  const now = Date.now();
  const ms = timer.status === 'paused' ? timer.left : durationMs(timer, settings);
  timer = { ...timer, status: 'running', endAt: now + ms, left: 0, celebrateUntil: 0 };
  notify();
}

export function pause() {
  if (timer.status !== 'running') return;
  timer = { ...timer, status: 'paused', endAt: 0, left: Math.max(0, timer.endAt - Date.now()) };
  notify();
}

export function reset() {
  timer = fresh();
  notify();
}

export function skip() {
  timer = timer.phase === 'focus' ? next(timer, settings, Date.now(), false) : fresh(timer.sessions);
  notify();
}

export function bump(key: NumKey, dir: 1 | -1) {
  const f = FIELDS.find((x) => x.key === key)!;
  settings = { ...settings, [key]: snap(key, settings[key] + dir * f.step) };
  save();
}

export function toggleAutoStart() {
  settings = { ...settings, autoStartBreak: !settings.autoStartBreak };
  save();
}

function save() {
  try {
    localStorage.setItem('pomodoro', JSON.stringify(settings));
  } catch {
    // Storage blocked: the settings still work for this session.
  }
  notify();
}
