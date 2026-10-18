import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatMoney, currencyDigits, toMajor, parseAmount, parseDecimal } from '../lib/money';
import type { Minor } from '../domain/types';
import { useStore } from '../data/store';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 focus-visible:outline-brand-600',
  secondary: 'bg-white text-brand-900 ring-1 ring-slate-300 hover:bg-slate-50',
  ghost: 'text-brand-800 hover:bg-brand-50',
  danger: 'bg-loss text-white hover:bg-red-800',
  success: 'bg-gain text-white hover:bg-green-800',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('print-break rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-brand-900">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-loss">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100';

export function Input({ label, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} aria-invalid={!!error} {...p} className={cx(inputCls, className)} />
    </Field>
  );
}

export function Select({ label, hint, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} {...p} className={inputCls}>
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 rounded border-slate-300 accent-brand-800" />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
}

/** Amount input: the driver types in major units with their usual separator; the value is minor units. */
export function MoneyInput({
  label,
  value,
  onChange,
  currency,
  hint,
  allowEmpty = true,
}: {
  label: ReactNode;
  value: Minor | null;
  onChange: (v: Minor | null) => void;
  currency: string;
  hint?: ReactNode;
  allowEmpty?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const show = (v: Minor | null) =>
    v == null ? '' : new Intl.NumberFormat(i18n.language, { useGrouping: false, maximumFractionDigits: currencyDigits(currency) }).format(toMajor(v, currency));
  const [text, setText] = useState(show(value));
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parseAmount(text, currency) !== value) setText(show(value));
  }
  return (
    <Input
      label={
        <>
          {label} <span className="text-slate-400">({currency})</span>
        </>
      }
      inputMode="decimal"
      value={text}
      hint={hint}
      error={err}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        if (!s.trim()) {
          setErr(allowEmpty ? null : t('errors.required'));
          onChange(allowEmpty ? null : 0);
          return;
        }
        const v = parseAmount(s, currency);
        if (v === null || v < 0) setErr(t('errors.invalidAmount'));
        else {
          setErr(null);
          setLast(v);
          onChange(v);
        }
      }}
    />
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  hint,
  suffix,
  min = 0,
  max,
}: {
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: ReactNode;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parseDecimal(text) !== value) setText(value == null ? '' : String(value));
  }
  return (
    <Input
      label={
        <>
          {label} {suffix && <span className="text-slate-400">({suffix})</span>}
        </>
      }
      inputMode="decimal"
      value={text}
      hint={hint}
      error={err}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        if (!s.trim()) {
          setErr(null);
          onChange(null);
          return;
        }
        const v = parseDecimal(s);
        if (v === null || v < min || (max != null && v > max)) setErr(t('errors.invalidNumber'));
        else {
          setErr(null);
          setLast(v);
          onChange(v);
        }
      }}
    />
  );
}

export function useMoney() {
  const { profile, locale } = useStore();
  const currency = profile?.currency ?? 'EUR';
  return {
    currency,
    locale,
    fmt: (v: Minor | null | undefined, sign = false) => (v == null ? '—' : formatMoney(v, currency, locale, { sign })),
  };
}

export function Money({ value, sign, colored, className }: { value: Minor | null | undefined; sign?: boolean; colored?: boolean; className?: string }) {
  const { fmt } = useMoney();
  const tone = colored && value ? (value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : '') : '';
  return <span className={cx('tabular whitespace-nowrap', tone, className)}>{fmt(value, sign)}</span>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'gain' | 'loss' | 'warn' | 'info'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    gain: 'bg-gain-bg text-gain',
    loss: 'bg-loss-bg text-loss',
    warn: 'bg-warn-bg text-warn',
    info: 'bg-brand-100 text-brand-800',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

/** KPI tile. Direction is conveyed by icon + sign + text, never by colour alone. */
export function Stat({
  label,
  value,
  sub,
  tone,
  estimated,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'gain' | 'loss' | 'neutral';
  estimated?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = tone === 'gain' ? TrendingUp : tone === 'loss' ? TrendingDown : tone === 'neutral' ? Minus : null;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 flex items-center gap-1.5 text-xl font-bold tabular sm:text-2xl', tone === 'gain' && 'text-gain', tone === 'loss' && 'text-loss', !tone && 'text-brand-900')}>
        {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
        <span className="min-w-0 break-words">{value}</span>
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      {estimated && <p className="mt-1"><Badge tone="warn">{t('common.estimated')}</Badge></p>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-semibold text-brand-900">{title}</p>
      {text && <p className="max-w-md text-sm text-slate-600">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'loss' | 'gain'; children: ReactNode }) {
  const tones = {
    info: 'bg-brand-50 text-brand-900 ring-brand-100',
    warn: 'bg-warn-bg text-warn ring-yellow-200',
    loss: 'bg-loss-bg text-loss ring-red-200',
    gain: 'bg-gain-bg text-gain ring-green-200',
  };
  return <div className={cx('rounded-xl p-3 text-sm ring-1', tones[tone])}>{children}</div>;
}

export function InDevelopment({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Notice tone="warn">
      <strong>{t('common.inDevelopment')}</strong> {children}
    </Notice>
  );
}

export function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-9 rounded-lg px-3 text-sm font-medium transition', value === o.value ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600 hover:text-brand-900')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
