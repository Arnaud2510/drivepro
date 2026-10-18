import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useStore } from '../data/store';
import { useFormat } from '../components/hooks';
import { Badge, Card, EmptyState, Input, Money, PageHeader, Select } from '../components/ui';

type Sort = 'date' | 'profit' | 'perHour';

export function HistoryPage() {
  const { t } = useTranslation();
  const { results, data } = useStore();
  const f = useFormat();
  const [q, setQ] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const notes = new Map(data.days.map((d) => [d.id, d.notes]));

  const rows = useMemo(() => {
    const filtered = results.filter((r) => {
      if (vehicle && r.vehicleId !== vehicle) return false;
      if (platform && !r.earnings.some((e) => (e.platformId ?? 'direct') === platform)) return false;
      if (status === 'issues' && !r.issues.some((i) => i !== 'payoutNotReceived')) return false;
      if (status === 'estimated' && !r.hasEstimates) return false;
      if (q && !(r.date.includes(q) || (notes.get(r.dayId) ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
    const key = (r: (typeof results)[number]) => (sort === 'date' ? r.date : sort === 'profit' ? r.profit : r.profitPerHour ?? -Infinity);
    return filtered.sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
  }, [results, vehicle, platform, status, q, sort, notes]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle', { count: results.length })} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Input label={t('common.search')} placeholder="2026-10" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label={t('day.vehicle')} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select label={t('day.platform')} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {data.platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="direct">{t('day.directRides')}</option>
        </Select>
        <Select label={t('history.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="issues">{t('history.withIssues')}</option>
          <option value="estimated">{t('history.withEstimates')}</option>
        </Select>
        <Select label={t('common.sortBy')} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="date">{t('common.date')}</option>
          <option value="profit">{t('dashboard.profit')}</option>
          <option value="perHour">{t('dashboard.perHour')}</option>
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t('history.empty')} action={<Link to="/app/day" className="font-semibold text-brand-700 underline">{t('dashboard.enterToday')}</Link>} />
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const issues = r.issues.filter((i) => !['payoutNotReceived', 'commissionEstimated'].includes(i));
              return (
                <li key={r.dayId}>
                  <Link to={`/app/day/${r.date}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-900">
                        {f.date(r.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {r.hasEstimates && <Badge tone="warn">{t('common.estimated')}</Badge>}
                        {issues.length > 0 && (
                          <Badge tone="loss">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> {t('history.incomplete', { count: issues.length })}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t('dashboard.revenue')} <Money value={r.grossRevenue} /> · {t('dashboard.totalCosts')} <Money value={r.totalCosts} /> · {f.km(r.businessKm)} · {f.hours(r.hours)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={r.profit} sign colored className="font-bold" />
                      <p className="text-xs text-slate-500">{f.perHour(r.profitPerHour)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
