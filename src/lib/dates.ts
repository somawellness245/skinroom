const DAY = 24 * 60 * 60 * 1000;

export function today(): string {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses 'YYYY-MM-DD' as a local date (not UTC) so it doesn't shift a day. */
export function parseDate(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);
}

export function daysSince(s: string): number {
  return daysBetween(toISODate(parseDate(s)), today());
}

export function fmtDate(s: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!s) return '—';
  return parseDate(s).toLocaleDateString(undefined, opts);
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
}

export function fmtDue(s: string | null): string {
  if (!s) return 'Not scheduled';
  const n = daysBetween(today(), s);
  if (n < 0) return `Overdue ${-n}d`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return parseDate(s).toLocaleDateString(undefined, { weekday: 'short' });
  return fmtDate(s);
}

/** Months (1-based) since a date, for "month 2 of 4"-style labels. */
export function monthNumber(since: string | null): number {
  if (!since) return 1;
  return Math.max(1, Math.floor(daysSince(since) / 30) + 1);
}
