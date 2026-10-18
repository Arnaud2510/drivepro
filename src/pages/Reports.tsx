import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Printer } from 'lucide-react';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Badge, Button, Card, Input, Money, PageHeader, Select, useMoney } from '../components/ui';
import { comparePlatforms, compareVehicles, computePeriod } from '../lib/finance/engine';
import { addDays, monthEnd, monthStart, weekStart } from '../lib/dates';
import { toMajor, currencyDigits } from '../lib/money';
import { toCSV, download } from '../lib/csv';
import { APP_NAME } from '../components/Logo';
import { IS_PREVIEW } from '../config/env';
import { Notice } from '../components/ui';

type Kind = 'day' | 'week' | 'month' | 'year' | 'custom';

export function Reports() {
  const { t } = useTranslation();
  const { dataset, profile } = useStore();
  const today = useToday();
  const f = useFormat();
  const { currency, fmt } = useMoney();
  const [kind, setKind] = useState<Kind>('month');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: monthStart(today), to: today });
  const [sep, setSep] = useState(';');

  const [from, to] = useMemo((): [string, string] => {
    if (kind === 'day') return [anchor, anchor];
    if (kind === 'week') return [weekStart(anchor), addDays(weekStart(anchor), 6)];
    if (kind === 'month') return [monthStart(anchor), monthEnd(anchor)];
    if (kind === 'year') return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
    return [custom.from, custom.to];
  }, [kind, anchor, custom]);

  const p = useMemo(() => (dataset ? computePeriod(dataset, from, to, to > today ? today : to) : null), [dataset, from, to, today]);
  if (!p || !profile) return null;
  const byPlatform = comparePlatforms(p.days, currency);
  const byVehicle = compareVehicles(p.days, currency);
  const m = (v: number) => toMajor(v, currency).toFixed(currencyDigits(currency));

  const summary: [string, React.ReactNode, string | number][] = [
    [t('dashboard.revenue'), <Money value={p.grossRevenue} />, m(p.grossRevenue)],
    [t('dashboard.commissions'), <Money value={p.commissions + p.platformFees} />, m(p.commissions + p.platformFees)],
    [t('reports.energy'), <Money value={p.energy} />, m(p.energy)],
    [t('dashboard.variableExpenses'), <Money value={p.variableExpenses + p.offDayExpenses} />, m(p.variableExpenses + p.offDayExpenses)],
    [t('stats.fixedCosts'), <Money value={p.fixedCosts} />, m(p.fixedCosts)],
    [t('dashboard.profit'), <Money value={p.profit} sign colored />, m(p.profit)],
    [t('dashboard.hours'), f.hours(p.hours), p.hours.toFixed(2)],
    [t('dashboard.distance'), f.km(p.km), p.km],
    [t('dashboard.perHour'), f.perHour(p.profitPerHour), p.profitPerHour?.toFixed(2) ?? ''],
    [t('dashboard.costPerKm'), f.perKm(p.costPerKm), p.costPerKm?.toFixed(3) ?? ''],
    [t('dashboard.margin'), f.pct(p.marginPct), p.marginPct?.toFixed(1) ?? ''],
    [t('reports.estimatedDays'), `${p.daysWithEstimates} / ${p.workedDays}`, p.daysWithEstimates],
  ];

  function exportCSV() {
    const rows: (string | number | null)[][] = [
      [APP_NAME, t('reports.title'), `${from} → ${to}`, currency],
      [],
      ...summary.map(([k, , v]) => [k, v]),
      [],
      [t('common.date'), t('dashboard.revenue'), t('dashboard.commissions'), t('reports.energy'), t('reports.energySource'), t('dashboard.variableExpenses'), t('dashboard.fixedShare'), t('dashboard.profit'), t('dashboard.hours'), 'km', t('reports.estimated'), t('reports.issues')],
      ...p!.days.map((d) => [
        d.date, m(d.grossRevenue), m(d.commissions + d.platformFees), m(d.energy.cost), t(`reports.src.${d.energy.source}`),
        m(d.variableExpenses), m(d.fixedShare), m(d.profit), d.hours?.toFixed(2) ?? '', d.businessKm ?? '',
        d.hasEstimates ? t('common.yes') : t('common.no'), d.issues.map((i) => t(`issues.${i}`)).join(' | '),
      ]),
    ];
    download(`${APP_NAME.toLowerCase()}-${from}_${to}.csv`, toCSV(rows, sep));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('reports.title')}
        subtitle={`${f.date(from)} → ${f.date(to)}`}
        actions={
          <>
            {!IS_PREVIEW && (
              <>
                <Button variant="secondary" onClick={exportCSV}><Download className="h-4 w-4" aria-hidden /> CSV / Excel</Button>
                <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> {t('reports.pdf')}</Button>
              </>
            )}
          </>
        }
      />
      {IS_PREVIEW && <Notice>{t('preview.exportsDisabled')}</Notice>}
      <Card className="no-print">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select label={t('reports.kind')} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(['day', 'week', 'month', 'year', 'custom'] as const).map((k) => <option key={k} value={k}>{t(`reports.kinds.${k}`)}</option>)}
          </Select>
          {kind === 'custom' ? (
            <>
              <Input label={t('reports.from')} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <Input label={t('reports.to')} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </>
          ) : (
            <Input label={t('reports.reference')} type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
          )}
          <Select label={t('reports.separator')} value={sep} onChange={(e) => setSep(e.target.value)} hint={t('reports.separatorHint')}>
            <option value=";">;</option>
            <option value=",">,</option>
          </Select>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('reports.pdfHint')}</p>
      </Card>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{APP_NAME} — {t('reports.title')}</h1>
        <p>{profile.displayName} · {f.date(from)} → {f.date(to)} · {currency}</p>
      </div>

      <Card title={t('reports.summary')}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {summary.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 py-1">
              <dt className="text-slate-600">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {p.daysWithEstimates > 0 && <p className="mt-3 text-xs text-warn">{t('reports.containsEstimates')}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {[
          { title: t('reports.byPlatform'), rows: byPlatform, name: f.platformName },
          { title: t('reports.byVehicle'), rows: byVehicle, name: f.vehicleName },
        ].map((g) => (
          <Card key={g.title} title={g.title}>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">{t('compare.item')}</th><th className="py-1 text-right">{t('dashboard.revenue')}</th><th className="py-1 text-right">{t('dashboard.profit')}</th><th className="py-1 text-right">{t('dashboard.perHour')}</th></tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="py-1.5">{g.name(r.key)} {r.prorated && <Badge tone="warn">{t('compare.proratedShort')}</Badge>}</td>
                    <td className="py-1.5 text-right"><Money value={r.grossRevenue} /></td>
                    <td className="py-1.5 text-right"><Money value={r.profit} sign colored /></td>
                    <td className="py-1.5 text-right">{f.perHour(r.profitPerHour)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
        <Card title={t('reports.byCategory')}>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(p.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="py-1.5">{f.category(k)} {k === 'fuelEstimated' && <Badge tone="warn">{t('common.estimated')}</Badge>}</td>
                  <td className="py-1.5 text-right font-semibold">{fmt(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <p className="text-xs text-slate-500">{t('common.operatingDisclaimer')}</p>
    </div>
  );
}
