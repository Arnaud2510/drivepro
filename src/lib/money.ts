import type { Minor } from '../domain/types';

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (EUR 2, XOF 0, GNF 0...), from the ICU data. */
export function currencyDigits(currency: string): number {
  let d = digitsCache.get(currency);
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(currency, d);
  }
  return d;
}

/** Round half away from zero (commercial rounding), robust to float noise like 2.675 -> 2.67499999. */
export function roundHalfAway(x: number): number {
  const r = Math.round(Math.abs(x) + 1e-9);
  return x < 0 ? -r : r;
}

export const toMinor = (major: number, currency: string): Minor =>
  roundHalfAway(major * 10 ** currencyDigits(currency));

export const toMajor = (minor: Minor, currency: string): number => minor / 10 ** currencyDigits(currency);

export function formatMoney(minor: Minor, currency: string, locale: string, opts: { sign?: boolean } = {}): string {
  const f = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  });
  return f.format(toMajor(minor || 0, currency)); // avoid "-0,00"
}

/** Formats a per-unit ratio (e.g. €/km) with extra precision. */
export function formatRate(major: number, currency: string, locale: string, extraDigits = 1): string {
  const d = currencyDigits(currency) + extraDigits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Math.min(d, 4),
    maximumFractionDigits: Math.min(d, 4),
  }).format(major);
}

export function formatNumber(n: number, locale: string, maxDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits }).format(n);
}

/**
 * Parses a user-typed amount into minor units. Accepts "1 234,56", "1,234.56",
 * "1.500" (XOF thousands), "12,5". Returns null when the input is not a number.
 */
export function parseAmount(input: string, currency: string): Minor | null {
  const n = parseDecimal(input, currencyDigits(currency));
  return n === null ? null : toMinor(n, currency);
}

/** Parses a decimal number typed with either separator. maxDecimals guides ambiguous cases. */
export function parseDecimal(input: string, maxDecimals = 4): number | null {
  let s = input.trim().replace(/[\s  ']/g, '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let frac = '';
  if (lastSep >= 0) {
    const after = s.slice(lastSep + 1);
    const sepCount = (s.match(/[.,]/g) ?? []).length;
    const mixed = s.includes(',') && s.includes('.');
    const isDecimal =
      maxDecimals > 0 && (mixed || (sepCount === 1 && after.length > 0 && (after.length !== 3 || maxDecimals >= 3)));
    if (isDecimal) {
      intPart = s.slice(0, lastSep);
      frac = after;
    }
    intPart = intPart.replace(/[.,]/g, '');
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || (intPart === '' && frac === '')) return null;
  const v = Number(`${intPart || '0'}.${frac || '0'}`);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

export interface FxRate {
  from: string;
  to: string;
  rate: number; // 1 unit of `from` = rate units of `to`
  date: string;
  source: string;
}

/** Explicit, traceable currency conversion. Never applied silently by the app. */
export function convert(amount: Minor, fx: FxRate): { amount: Minor; currency: string; fx: FxRate } {
  if (!(fx.rate > 0)) throw new Error('Invalid exchange rate');
  if (!fx.source || !fx.date) throw new Error('Exchange rate must have a source and a date');
  const major = toMajor(amount, fx.from) * fx.rate;
  return { amount: toMinor(major, fx.to), currency: fx.to, fx };
}
