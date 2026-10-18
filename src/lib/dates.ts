import type { ISODate } from '../domain/types';

/** Calendar date (YYYY-MM-DD) of an instant in a given IANA time zone. */
export function dateInTimeZone(instant: Date, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const todayIn = (timeZone: string) => dateInTimeZone(new Date(), timeZone);

export function parseISO(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split('-').map(Number);
  return { y, m, d: dd };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: dd } = parseISO(d);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return t.toISOString().slice(0, 10);
}

export const monthKey = (d: ISODate) => d.slice(0, 7);
export const monthStart = (d: ISODate) => `${d.slice(0, 7)}-01`;
export function monthEnd(d: ISODate): ISODate {
  const { y, m } = parseISO(d);
  return `${d.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}
export function addMonths(d: ISODate, n: number): ISODate {
  const { y, m } = parseISO(d);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
}

/** Inclusive list of dates between a and b. */
export function eachDay(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday-based start of week. */
export function weekStart(d: ISODate): ISODate {
  const { y, m, d: dd } = parseISO(d);
  const dow = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

export function minutesOf(hhmm: string | null): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatDate(d: ISODate, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  const { y, m, d: dd } = parseISO(d);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
}
