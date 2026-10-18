import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Button, Card, Money, PageHeader, cx } from '../components/ui';
import { addDays, addMonths, eachDay, monthEnd, monthStart, weekStart } from '../lib/dates';
import { computePeriod } from '../lib/finance/engine';

export function CalendarPage() {
  const { t } = useTranslation();
  const { results, dataset } = useStore();
  const today = useToday();
  const f = useFormat();
  const [month, setMonth] = useState(monthStart(today));
  const byDate = new Map(results.map((r) => [r.date, r]));
  const start = weekStart(month);
  const end = addDays(weekStart(monthEnd(month)), 6);
  const cells = eachDay(start, end);
  const weekdays = eachDay(start, addDays(start, 6)).map((d) => f.date(d, { weekday: 'short' }));
  const period = dataset ? computePeriod(dataset, month, monthEnd(month), today < monthEnd(month) ? today : monthEnd(month)) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={t('calendar.title')} />
      <div className="flex items-center justify-between">
        <Button variant="secondary" aria-label={t('common.previous')} onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold capitalize text-brand-900">{f.date(month, { month: 'long', year: 'numeric' })}</h2>
        <Button variant="secondary" aria-label={t('common.next')} onClick={() => setMonth(addMonths(month, 1))} disabled={addMonths(month, 1) > today}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const r = byDate.get(d);
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const future = d > today;
            const issues = r?.issues.filter((i) => !['payoutNotReceived', 'commissionEstimated'].includes(i)).length ?? 0;
            const body = (
              <div
                className={cx(
                  'flex min-h-16 flex-col rounded-lg p-1 text-left ring-1 sm:min-h-20 sm:p-1.5',
                  !inMonth && 'opacity-40',
                  r ? (r.profit >= 0 ? 'bg-gain-bg/60 ring-green-200' : 'bg-loss-bg/60 ring-red-200') : 'bg-white ring-slate-100',
                  d === today && 'ring-2 ring-brand-700',
                )}
              >
                <span className="text-xs font-semibold text-slate-700">{Number(d.slice(8))}</span>
                {r && (
                  <>
                    <span className={cx('mt-auto truncate text-[10px] font-bold sm:text-xs', r.profit >= 0 ? 'text-gain' : 'text-loss')}>
                      <Money value={r.profit} sign />
                    </span>
                    <span className="hidden truncate text-[10px] text-slate-500 sm:block">{f.km(r.businessKm)} · {f.hours(r.hours)}</span>
                    {issues > 0 && <span className="text-[10px] font-semibold text-warn" title={t('history.incomplete', { count: issues })}>⚠ {issues}</span>}
                  </>
                )}
              </div>
            );
            return future ? <div key={d}>{body}</div> : <Link key={d} to={`/app/day/${d}`} aria-label={f.date(d, { dateStyle: 'full' })}>{body}</Link>;
          })}
        </div>
      </Card>
      {period && (
        <Card title={t('calendar.monthTotal')}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><dt className="text-slate-500">{t('dashboard.revenue')}</dt><dd className="font-semibold"><Money value={period.grossRevenue} /></dd></div>
            <div><dt className="text-slate-500">{t('dashboard.expenses')}</dt><dd className="font-semibold"><Money value={period.totalCostsExclCommission + period.commissions + period.platformFees} /></dd></div>
            <div><dt className="text-slate-500">{t('dashboard.profit')}</dt><dd className="font-semibold"><Money value={period.profit} sign colored /></dd></div>
            <div><dt className="text-slate-500">{t('dashboard.distance')}</dt><dd className="font-semibold">{f.km(period.km)}</dd></div>
            <div><dt className="text-slate-500">{t('dashboard.hours')}</dt><dd className="font-semibold">{f.hours(period.hours)}</dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
}
