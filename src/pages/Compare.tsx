import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Badge, Card, EmptyState, Money, Notice, PageHeader, Toggle } from '../components/ui';
import { ChartFrame, GAIN, LOSS } from '../components/charts';
import { comparePlatforms, compareVehicles, MIN_COMPARE_DAYS, MIN_COMPARE_HOURS, type CompareRow } from '../lib/finance/engine';
import { addDays } from '../lib/dates';
import { formatNumber } from '../lib/money';

export function Compare() {
  const { t } = useTranslation();
  const { results, profile, locale } = useStore();
  const today = useToday();
  const f = useFormat();
  const [by, setBy] = useState<'platform' | 'vehicle'>('platform');
  const [range, setRange] = useState<'30' | '90' | 'all'>('90');
  const currency = profile?.currency ?? 'EUR';

  const rows = useMemo(() => {
    const rs = range === 'all' ? results : results.filter((r) => r.date >= addDays(today, -Number(range) + 1));
    const out = by === 'platform' ? comparePlatforms(rs, currency) : compareVehicles(rs, currency);
    return out.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity));
  }, [results, by, range, today, currency]);

  const name = (r: CompareRow) => (by === 'platform' ? f.platformName(r.key) : f.vehicleName(r.key));
  const anyProrated = rows.some((r) => r.prorated);
  const sufficient = rows.filter((r) => r.sufficient && r.profitPerHour != null);

  return (
    <div className="space-y-5">
      <PageHeader title={t('compare.title')} subtitle={t('compare.subtitle')} />
      <div className="flex flex-wrap gap-3">
        <Toggle label={t('compare.by')} value={by} onChange={setBy} options={[{ value: 'platform', label: t('compare.byPlatform') }, { value: 'vehicle', label: t('compare.byVehicle') }]} />
        <Toggle label={t('common.period')} value={range} onChange={setRange} options={[{ value: '30', label: t('stats.r30d') }, { value: '90', label: t('compare.r90') }, { value: 'all', label: t('common.allTime') }]} />
      </div>
      <Notice>{t('compare.method', { days: MIN_COMPARE_DAYS, hours: MIN_COMPARE_HOURS })}</Notice>
      {anyProrated && <Notice tone="warn">{t('compare.prorated')}</Notice>}
      {rows.length === 0 ? (
        <EmptyState title={t('common.noDataPeriod')} />
      ) : (
        <>
          {sufficient.length >= 2 && (
            <Card title={t('compare.chartTitle')}>
              <ChartFrame table={{ head: [t('compare.item'), t('dashboard.perHour')], rows: sufficient.map((r) => [name(r), f.perHour(r.profitPerHour)]) }}>
                <ResponsiveContainer>
                  <BarChart data={sufficient.map((r) => ({ name: name(r), v: r.profitPerHour }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => f.perHour(v)} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => f.perHour(v)} />
                    <Bar dataKey="v" name={t('dashboard.perHour')} radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {sufficient.map((r, i) => <Cell key={i} fill={(r.profitPerHour ?? 0) >= 0 ? GAIN : LOSS} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{t('compare.item')}</th>
                  <th className="py-2 pr-3 text-right">{t('compare.days')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.revenue')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.commissions')}</th>
                  <th className="py-2 pr-3 text-right">{t('compare.costs')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.profit')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.hours')}</th>
                  <th className="py-2 pr-3 text-right">km</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.perHour')}</th>
                  <th className="py-2 text-right">{t('dashboard.perKm')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium">
                      {name(r)} {!r.sufficient && <Badge tone="warn">{t('compare.insufficient')}</Badge>}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">{formatNumber(r.days, locale, 1)}</td>
                    <td className="py-2 pr-3 text-right"><Money value={r.grossRevenue} /></td>
                    <td className="py-2 pr-3 text-right"><Money value={r.commissions} /></td>
                    <td className="py-2 pr-3 text-right"><Money value={r.costs} /></td>
                    <td className="py-2 pr-3 text-right font-semibold"><Money value={r.profit} sign colored /></td>
                    <td className="tabular py-2 pr-3 text-right">{f.hours(r.hours)}</td>
                    <td className="tabular py-2 pr-3 text-right">{f.km(r.km)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{r.sufficient ? f.perHour(r.profitPerHour) : '—'}</td>
                    <td className="py-2 text-right">{r.sufficient ? f.perKm(r.profitPerKm) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-500">{t('compare.sortNote')}</p>
        </>
      )}
    </div>
  );
}
