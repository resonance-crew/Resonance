/** The bell's parts, newest first: the viewer's today, the six days before it, and everything older. */
export type BellGroup = 'today' | 'thisWeek' | 'earlier';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days between two moments, in the viewer's time zone (yesterday 23:59 is one day before today 00:01). */
function calendarDays(at: Date, now: Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY_MS);
}

/** Which part of the bell a row stands in (the apps' twins: NotificationsScreen's `group`). */
export function bellGroup(at: Date, now: Date): BellGroup {
  const days = calendarDays(at, now);
  if (days <= 0) return 'today';
  return days < 7 ? 'thisWeek' : 'earlier';
}

/**
 * When it happened, as its row says it — in step with its part of the bell: under 今天 the minutes or
 * hours (under a minute, `justNow`), under 這週 the calendar days (昨天, 3 天前), and earlier the date
 * (the year too when it isn't this year's).
 */
export function bellWhen(at: Date, now: Date, locale: string, justNow: string): string {
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const days = calendarDays(at, now);
  if (days <= 0) {
    const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
    if (minutes < 1) return justNow;
    return minutes < 60 ? rel.format(-minutes, 'minute') : rel.format(-Math.floor(minutes / 60), 'hour');
  }
  if (days < 7) return rel.format(-days, 'day');
  const sameYear = at.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear ? { month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'numeric', day: 'numeric' }).format(at);
}
