import type { ReactNode } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ReferenceLine, Cell } from 'recharts';
import { useMoney } from './ui';
import { formatMoney } from '../lib/money';

/** Formatter in the profile currency, or in an explicit one (e.g. a fleet's currency). */
function useFmt(currency?: string) {
  const { fmt, locale } = useMoney();
  return currency ? (v: number | null | undefined, sign = false) => (v == null ? '—' : formatMoney(v, currency, locale, { sign })) : fmt;
}
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Validated categorical slots (dataviz reference palette), assigned in fixed order. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const GAIN = '#15803d';
export const LOSS = '#b91c1c';
const AXIS = { fontSize: 12, fill: '#52514e' };
/** Discreet animations, disabled when the system asks for reduced motion. */
const ANIMATE = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function MoneyTooltip({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency?: string }) {
  const fmt = useFmt(currency);
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-brand-900">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="tabular font-semibold">{fmt(p.value, p.value < 0)}</span>
        </p>
      ))}
    </div>
  );
}

/** Each chart has a table toggle so the data is never readable through colour alone. */
export function ChartFrame({ children, table, height = 260 }: { children: ReactNode; table: { head: string[]; rows: (string | number)[][] }; height?: number }) {
  const { t } = useTranslation();
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="no-print mb-2 flex justify-end">
        <button type="button" onClick={() => setShowTable((s) => !s)} className="text-xs font-medium text-brand-700 underline">
          {showTable ? t('charts.showChart') : t('charts.showTable')}
        </button>
      </div>
      {showTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                {table.head.map((h) => (
                  <th key={h} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {r.map((c, j) => (
                    <td key={j} className="tabular py-1 pr-3">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </div>
  );
}

export function RevenueCostChart({ data }: { data: { label: string; revenue: number; costs: number }[] }) {
  const { t } = useTranslation();
  const { fmt } = useMoney();
  return (
    <ChartFrame table={{ head: [t('common.date'), t('dashboard.revenue'), t('dashboard.totalCosts')], rows: data.map((d) => [d.label, fmt(d.revenue), fmt(d.costs)]) }}>
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt(v).replace(/[,.]00(?=\D*$)/, '')} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={ANIMATE} animationDuration={500} dataKey="revenue" name={t('dashboard.revenue')} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar isAnimationActive={ANIMATE} animationDuration={500} dataKey="costs" name={t('dashboard.totalCosts')} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Profit by period: polarity shown by bar direction, sign in the tooltip/table, and colour. */
export function ProfitBars({ data, goal, currency }: { data: { label: string; profit: number }[]; goal?: number | null; currency?: string }) {
  const { t } = useTranslation();
  const fmt = useFmt(currency);
  return (
    <ChartFrame table={{ head: [t('common.period'), t('dashboard.profit')], rows: data.map((d) => [d.label, fmt(d.profit, true)]) }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt(v).replace(/[,.]00(?=\D*$)/, '')} />
          <Tooltip content={<MoneyTooltip currency={currency} />} cursor={{ fill: '#f1f5f9' }} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          {goal ? <ReferenceLine y={goal} stroke={SERIES[6]} strokeDasharray="4 4" label={{ value: t('goals.goal'), fontSize: 11, fill: '#52514e', position: 'insideTopRight' }} /> : null}
          <Bar isAnimationActive={ANIMATE} animationDuration={500} dataKey="profit" name={t('dashboard.profit')} radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.profit >= 0 ? GAIN : LOSS} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RateLine({ data, name, format }: { data: { label: string; value: number | null }[]; name: string; format: (v: number | null) => string }) {
  const { t } = useTranslation();
  return (
    <ChartFrame table={{ head: [t('common.period'), name], rows: data.map((d) => [d.label, format(d.value)]) }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => format(v)} />
          <Tooltip formatter={(v: number) => format(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          <Line isAnimationActive={ANIMATE} animationDuration={500} type="monotone" dataKey="value" name={name} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Horizontal labelled bars — more legible than a pie for an expense breakdown. */
export function BreakdownBars({ items, total }: { items: { label: string; value: number; estimated?: boolean }[]; total?: number }) {
  const { fmt } = useMoney();
  const { t } = useTranslation();
  const max = Math.max(1, ...items.map((i) => i.value));
  const sum = total ?? items.reduce((a, b) => a + b.value, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-slate-700">
              {i.label}
              {i.estimated && <span className="ml-1 text-xs text-warn">({t('common.estimated')})</span>}
            </span>
            <span className="tabular font-semibold text-slate-900">
              {fmt(i.value)} <span className="text-xs font-normal text-slate-500">{sum ? Math.round((i.value / sum) * 100) : 0} %</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
            <div className="h-2 rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: SERIES[1] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="h-3 rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.floor(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-3 rounded-full ${pct >= 100 ? 'bg-gain' : 'bg-brand-700'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{Math.floor((value / (max || 1)) * 100)} %</p>
    </div>
  );
}
