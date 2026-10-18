import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Card, Money, PageHeader, Select, Stat, Toggle, EmptyState } from '../components/ui';
import { BreakdownBars, ProfitBars, RateLine, RevenueCostChart } from '../components/charts';
import { computePeriod, type DataSet } from '../lib/finance/engine';
import { addDays, addMonths, eachDay, monthEnd, monthStart } from '../lib/dates';

type Range = '7d' | '30d' | 'month' | '12m';

export function Stats() {
  const { t } = useTranslation();
  const { dataset, data, profile } = useStore();
  const today = useToday();
  const f = useFormat();
  const [range, setRange] = useState<Range>('30d');
  const [vehicle, setVehicle] = useState('');

  const ds = useMemo<DataSet | null>(() => {
    if (!dataset) return null;
    if (!vehicle) return dataset;
    return {
      ...dataset,
      days: dataset.days.filter((d) => d.vehicleId === vehicle),
      expenses: dataset.expenses.filter((e) => e.vehicleId === vehicle),
      fixedCosts: dataset.fixedCosts.filter((c) => c.vehicleId === vehicle),
    };
  }, [dataset, vehicle]);

  const from = range === '7d' ? addDays(today, -6) : range === '30d' ? addDays(today, -29) : range === 'month' ? monthStart(today) : monthStart(addMonths(today, -11));
  const period = useMemo(() => (ds ? computePeriod(ds, from, today) : null), [ds, from, today]);

  const months = useMemo(() => {
    if (!ds) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(monthStart(today), i - 11);
      const end = monthEnd(m) < today ? monthEnd(m) : today;
      const p = computePeriod(ds, m, end);
      return { label: f.date(m, { month: 'short' }), profit: p.profit, perHour: p.profitPerHour, worked: p.workedDays };
    });
  }, [ds, today, f]);

  if (!period || !profile) return null;

  const daily =
    range === '12m'
      ? months.map((m, i) => {
          const mm = addMonths(monthStart(today), i - 11);
          const p = computePeriod(ds!, mm, monthEnd(mm) < today ? monthEnd(mm) : today);
          return { label: m.label, revenue: p.grossRevenue, costs: p.grossRevenue - p.profit };
        })
      : eachDay(from, today).map((d) => {
          const r = period.days.find((x) => x.date === d);
          return { label: f.date(d, { day: 'numeric', month: 'short' }), revenue: r?.grossRevenue ?? 0, costs: r?.totalCosts ?? 0 };
        });

  const variable = period.energy + period.variableExpenses + period.offDayExpenses;
  const commissionTotal = period.commissions + period.platformFees;
  const breakdown = Object.entries(period.expensesByCategory)
    .map(([k, v]) => ({ label: f.category(k), value: v, estimated: k === 'fuelEstimated' }))
    .concat(commissionTotal ? [{ label: t('dashboard.commissions'), value: commissionTotal, estimated: false }] : [])
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <PageHeader title={t('stats.title')} />
      <div className="flex flex-wrap items-end gap-3">
        <Toggle<Range>
          label={t('common.period')}
          value={range}
          onChange={setRange}
          options={[
            { value: '7d', label: t('stats.r7d') },
            { value: '30d', label: t('stats.r30d') },
            { value: 'month', label: t('stats.rMonth') },
            { value: '12m', label: t('stats.r12m') },
          ]}
        />
        {data.vehicles.length > 1 && (
          <div className="w-48">
            <Select label={t('day.vehicle')} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
        )}
      </div>
      {period.workedDays === 0 ? (
        <EmptyState title={t('common.noDataPeriod')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dashboard.revenue')} value={<Money value={period.grossRevenue} />} sub={t('dashboard.workedDays', { count: period.workedDays })} />
            <Stat label={t('dashboard.profit')} value={<Money value={period.profit} sign />} tone={period.profit >= 0 ? 'gain' : 'loss'} sub={`${t('dashboard.margin')} ${f.pct(period.marginPct)}`} estimated={period.daysWithEstimates > 0} />
            <Stat label={t('dashboard.perHour')} value={f.perHour(period.profitPerHour)} sub={f.hours(period.hours)} />
            <Stat label={t('dashboard.perKm')} value={f.perKm(period.profitPerKm)} sub={`${t('dashboard.costPerKm')} ${f.perKm(period.costPerKm)}`} />
          </div>
          <Card title={t('stats.revenueVsCosts')}>
            <RevenueCostChart data={daily} />
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={t('stats.monthlyProfit')}>
              <ProfitBars data={months} goal={profile.monthlyGoal} />
            </Card>
            <Card title={t('stats.hourlyTrend')}>
              <RateLine data={months.map((m) => ({ label: m.label, value: m.perHour }))} name={t('dashboard.perHour')} format={(v) => f.perHour(v)} />
            </Card>
            <Card title={t('stats.breakdown')}>
              <BreakdownBars items={breakdown} />
            </Card>
            <Card title={t('stats.fixedVsVariable')}>
              <BreakdownBars
                items={[
                  { label: t('dashboard.commissions'), value: commissionTotal },
                  { label: t('stats.variableCosts'), value: variable },
                  { label: t('stats.fixedCosts'), value: period.fixedCosts },
                ]}
              />
              <p className="mt-3 text-xs text-slate-500">{t('stats.fixedNote', { method: t(`fixedMethod.${profile.fixedCostMethod}`) })}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
