export const pad = (n: number) => String(n).padStart(2, '0');

export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayStr = () => fmt(new Date());

export function parse(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

export function isToday(ts: number | null) {
  return ts != null && fmt(new Date(ts)) === todayStr();
}

/** Human label like Things: Today, Tomorrow, weekday within a week, else "Oct 21". */
export function dayLabel(s: string) {
  const today = todayStr();
  if (s === today) return 'Today';
  if (s === addDays(today, 1)) return 'Tomorrow';
  if (s === addDays(today, -1)) return 'Yesterday';
  const d = parse(s);
  const diff = (d.getTime() - parse(today).getTime()) / 86_400_000;
  if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function daysLeft(s: string) {
  const diff = Math.round((parse(s).getTime() - parse(todayStr()).getTime()) / 86_400_000);
  if (diff < 0) return `${-diff}d overdue`;
  if (diff === 0) return 'due today';
  return `${diff}d left`;
}
