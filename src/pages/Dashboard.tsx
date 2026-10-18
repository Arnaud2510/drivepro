import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Receipt, Car, History, BarChart3, Info } from 'lucide-react';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Card, Money, Notice, PageHeader, Stat, Badge, useMoney } from '../components/ui';
import { BreakdownBars, Progress, RevenueCostChart } from '../components/charts';
import { computePeriod, projectMonth } from '../lib/finance/engine';
import { addDays, monthStart } from '../lib/dates';
import { computeAlerts } from '../lib/alerts';

export function Dashboard() {
  const { t } = useTranslation();
  const { profile, dataset, results, data, error } = useStore();
  const today = useToday();
  const f = useFormat();
  const { fmt } = useMoney();

  const todayR = results.find((r) => r.date === today);
  const month = useMemo(() => (dataset ? computePeriod(dataset, monthStart(today), today) : null), [dataset, today]);
  const projection = useMemo(() => (dataset ? projectMonth(dataset, today, 'pace', profile?.monthlyGoal ?? null) : null), [dataset, today, profile]);
  const alerts = useMemo(() => (profile ? computeAlerts(profile, data, results, today, projection) : []), [profile, data, results, today, projection]);

  const last7 = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      const r = results.find((x) => x.date === d);
      out.push({ label: f.date(d, { weekday: 'short', day: 'numeric' }), revenue: r?.grossRevenue ?? 0, costs: r?.totalCosts ?? 0 });
    }
    return out;
  }, [results, today, f]);

  if (!profile || !month) return null;
  const breakdownSrc = todayR
    ? [
        { label: t('dashboard.commissions'), value: todayR.commissions + todayR.platformFees },
        { label: t('categories.fuel'), value: todayR.energy.cost, estimated: todayR.energy.source === 'estimated' },
        { label: t('dashboard.variableExpenses'), value: todayR.variableExpenses },
        { label: t('dashboard.fixedShare'), value: todayR.fixedShare },
      ]
    : [
        { label: t('dashboard.commissions'), value: month.commissions + month.platformFees },
        ...Object.entries(month.expensesByCategory).map(([k, v]) => ({ label: f.category(k), value: v, estimated: k === 'fuelEstimated' })),
      ];
  const breakdown = breakdownSrc.filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dashboard.hello', { name: profile.displayName || '' }).trim()}
        subtitle={f.date(today, { dateStyle: 'full' })}
        actions={
          <Link to="/app/day" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800">
            <CalendarPlus className="h-4 w-4" aria-hidden /> {todayR ? t('dashboard.editToday') : t('dashboard.enterToday')}
          </Link>
        }
      />
      {error && <Notice tone="loss">{t('errors.loadFailed', { message: error })}</Notice>}

      {alerts.some((a) => a.kind !== 'dailyReminder') && (
        <ul className="space-y-2" aria-label={t('alerts.title')}>
          {alerts.filter((a) => a.kind !== 'dailyReminder').slice(0, 4).map((a, i) => (
            <li key={i}>
              <Notice tone={a.tone}>
                {t(`alerts.${a.kind}`, {
                  ...a.params,
                  gap: typeof a.params.gap === 'number' ? fmt(a.params.gap) : undefined,
                  amount: typeof a.params.amount === 'number' ? fmt(a.params.amount) : undefined,
                  category: a.params.category ? f.category(String(a.params.category)) : undefined,
                  doc: a.params.doc ? t(`alerts.docs.${a.params.doc}`) : undefined,
                  date: a.params.date ? f.date(String(a.params.date)) : undefined,
                })}
              </Notice>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="today-h">
        <div className="mb-2 flex items-center gap-2">
          <h2 id="today-h" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('dashboard.today')}
          </h2>
          {todayR?.hasEstimates && <Badge tone="warn">{t('common.containsEstimates')}</Badge>}
        </div>
        {todayR ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dashboard.revenue')} value={<Money value={todayR.grossRevenue} />} sub={`${t('dashboard.commissions')} : ${fmt(todayR.commissions + todayR.platformFees)}`} />
            <Stat label={t('dashboard.expenses')} value={<Money value={todayR.costsExclCommission} />} sub={t('dashboard.exclCommission')} estimated={todayR.energy.source === 'estimated'} />
            <Stat label={t('dashboard.profit')} value={<Money value={todayR.profit} sign />} tone={todayR.profit > 0 ? 'gain' : todayR.profit < 0 ? 'loss' : 'neutral'} sub={`${t('dashboard.margin')} ${f.pct(todayR.marginPct)}`} />
            <Stat label={t('dashboard.perHour')} value={f.perHour(todayR.profitPerHour)} sub={`${f.hours(todayR.hours)} · ${f.km(todayR.businessKm)}`} />
          </div>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-slate-600">{t('dashboard.noDayYet')}</p>
              <Link to="/app/day" className="inline-flex min-h-11 items-center rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white">
                {t('dashboard.enterToday')}
              </Link>
            </div>
          </Card>
        )}
        {todayR && profile.dailyGoal ? (
          <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="mb-2 text-sm font-medium text-slate-700">
              {t('goals.dailyProgress')} : <Money value={todayR.profit} /> / <Money value={profile.dailyGoal} />
            </p>
            <Progress value={todayR.profit} max={profile.dailyGoal} label={t('goals.dailyProgress')} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="month-h">
        <h2 id="month-h" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('dashboard.thisMonth')}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('dashboard.profit')} value={<Money value={month.profit} sign />} tone={month.profit > 0 ? 'gain' : month.profit < 0 ? 'loss' : 'neutral'} sub={t('dashboard.workedDays', { count: month.workedDays })} />
          <Stat label={t('dashboard.perHour')} value={f.perHour(month.profitPerHour)} sub={f.hours(month.hours)} />
          <Stat label={t('dashboard.costPerKm')} value={f.perKm(month.costPerKm)} sub={f.km(month.km)} />
          <Stat label={t('dashboard.revenue')} value={<Money value={month.grossRevenue} />} sub={`${t('dashboard.commissions')} : ${fmt(month.commissions + month.platformFees)}`} />
        </div>
        {profile.monthlyGoal ? (
          <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="mb-2 text-sm font-medium text-slate-700">
              {t('goals.monthlyProgress')} : <Money value={month.profit} /> / <Money value={profile.monthlyGoal} />
            </p>
            <Progress value={month.profit} max={profile.monthlyGoal} label={t('goals.monthlyProgress')} />
            {projection?.projectedProfit != null && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {t('goals.projectionLine', { amount: fmt(projection.projectedProfit) })} <em>{t('goals.projectionDisclaimer')}</em>
                </span>
              </p>
            )}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card title={t('dashboard.last7')} className="lg:col-span-3">
          <RevenueCostChart data={last7} />
        </Card>
        <Card title={todayR ? t('dashboard.whereMoneyGoes') : t('dashboard.whereMoneyGoesMonth')} className="lg:col-span-2">
          {breakdown.length ? <BreakdownBars items={breakdown} /> : <p className="text-sm text-slate-500">{t('common.noData')}</p>}
          {(todayR ? todayR.ignoredEnergyExpenses : month.ignoredEnergyExpenses) > 0 && (
            <p className="mt-3 text-xs text-slate-500">{t('dashboard.ignoredEnergy', { amount: fmt(todayR ? todayR.ignoredEnergyExpenses : month.ignoredEnergyExpenses) })}</p>
          )}
        </Card>
      </div>

      <Card title={t('dashboard.quickActions')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { to: '/app/expenses?new=1', icon: Receipt, k: 'dashboard.addExpense' },
            { to: '/app/vehicles', icon: Car, k: 'dashboard.myVehicles' },
            { to: '/app/history', icon: History, k: 'dashboard.myHistory' },
            { to: '/app/stats', icon: BarChart3, k: 'dashboard.myStats' },
          ].map((a) => (
            <Link key={a.to} to={a.to} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm font-medium text-brand-900 ring-1 ring-slate-200 hover:bg-brand-50">
              <a.icon className="h-5 w-5" aria-hidden />
              {t(a.k)}
            </Link>
          ))}
        </div>
      </Card>
      <p className="text-xs text-slate-500">{t('common.operatingDisclaimer')}</p>
    </div>
  );
}
