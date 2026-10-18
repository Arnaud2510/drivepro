import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { useStore } from '../data/store';
import { newId } from '../data/repository';
import type { Earning, Expense, UserPlatform, WorkDay } from '../domain/types';
import { computeDay, computeEarning, dayHours, fixedShareForDay } from '../lib/finance/engine';
import { useFormat, useToday } from '../components/hooks';
import { Badge, Button, Card, Input, Money, MoneyInput, Notice, NumberInput, PageHeader, Select, useMoney } from '../components/ui';
import { useCatalog } from '../data/catalog';
import { useConfirm } from '../components/confirm';

const blankEarning = (platformId: string | null): Earning => ({
  id: newId(), platformId, label: '', grossKnown: true, gross: null, commission: null, otherFees: 0,
  bonus: 0, bonusIncluded: false, tips: 0, tipsIncluded: false, netPaid: null, payoutStatus: 'received',
});

// The form only asks for the day's turnover and the platform commission. Older entries
// (net only, bonus, tips, other fees) are folded into those two fields without changing the profit.
const simplifyEarning = (e: Earning, platform: UserPlatform | undefined): Earning => {
  const r = computeEarning(e, platform);
  const known = r.commissionSource === 'actual' || r.commissionSource === 'derived' || r.commissionSource === 'included';
  return {
    ...e, grossKnown: true, gross: e.gross == null && e.netPaid == null ? null : r.revenue,
    commission: known ? r.commission + r.otherFees : null, otherFees: 0,
    bonus: 0, bonusIncluded: false, tips: 0, tipsIncluded: false, netPaid: null, payoutStatus: 'received',
  };
};

export function DayEntry() {
  const { t } = useTranslation();
  const params = useParams();
  const nav = useNavigate();
  const today = useToday();
  const { data, profile, upsert, remove } = useStore();
  const { categories } = useCatalog();
  const ask = useConfirm();
  const { currency, fmt } = useMoney();
  const f = useFormat();
  const date = params.date ?? today;
  const existing = data.days.find((d) => d.date === date);
  const lastDay = [...data.days].filter((d) => d.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeVehicles = data.vehicles.filter((v) => !v.archived);
  const activePlatforms = data.platforms.filter((p) => p.active);

  const fresh = (): WorkDay => {
    const vehicleId = lastDay?.vehicleId ?? activeVehicles[0]?.id ?? null;
    return {
      id: newId(), date, startTime: null, endTime: null, breakMinutes: 0, hoursOverride: null, vehicleId,
      odoStart: null, odoEnd: null, distanceKm: null, personalKm: 0,
      // Fuel is whatever the driver enters as an expense: no kilometre-based estimate.
      trips: null, deliveries: null, energyMode: 'actual',
      earnings: activePlatforms.length ? [blankEarning(activePlatforms[0].id)] : [blankEarning(null)], notes: '',
    };
  };
  const load = (d: WorkDay): WorkDay => ({ ...d, earnings: d.earnings.map((e) => simplifyEarning(e, data.platforms.find((p) => p.id === e.platformId))) });
  const [day, setDay] = useState<WorkDay>(() => (existing ? load(existing) : fresh()));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newExp, setNewExp] = useState({ category: 'fuel', amount: null as number | null, description: '' });

  // Re-initialise when the date in the URL changes
  useEffect(() => {
    // The day we just saved becomes `existing`: keep the form and its confirmation.
    if (existing && existing.id === day.id) return;
    setDay(existing ? load(existing) : fresh());
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.id]);

  const set = (patch: Partial<WorkDay>) => setDay((d) => ({ ...d, ...patch }));
  // Hours always come from start, end and break.
  const setTime = (patch: Partial<WorkDay>) => set({ ...patch, hoursOverride: null });
  const hours = dayHours({ ...day, hoursOverride: null });
  const setEarning = (id: string, patch: Partial<Earning>) => setDay((d) => ({ ...d, earnings: d.earnings.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const dayExpenses = data.expenses.filter((e) => e.date === date);
  const vehicle = data.vehicles.find((v) => v.id === day.vehicleId);

  const result = useMemo(
    () =>
      profile &&
      computeDay(day, {
        vehicle,
        platforms: data.platforms,
        expenses: dayExpenses,
        fixedShare: fixedShareForDay(data.fixedCosts, date, profile.fixedCostMethod, profile.plannedWorkDays),
        currency,
      }),
    [day, vehicle, data.platforms, dayExpenses, data.fixedCosts, date, profile, currency],
  );

  if (!profile || !result) return null;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await upsert('days', day);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addExpense() {
    if (!newExp.amount) return;
    const e: Expense = {
      id: newId(), date, category: newExp.category, amount: newExp.amount, description: newExp.description,
      vehicleId: day.vehicleId, paymentMethod: 'cash', kind: categories.find((c) => c.id === newExp.category)?.defaultKind ?? 'daily', receiptPath: null,
    };
    await upsert('expenses', e);
    setNewExp({ ...newExp, amount: null, description: '' });
  }

  const issueTone = (i: string) => (['odometerInverted', 'netPaidMismatch'].includes(i) ? 'loss' : 'warn');
  const shownIssues = result.issues.filter((i) => !['commissionEstimated', 'payoutNotReceived', 'noDistance', 'odometerInverted'].includes(i));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('day.title')}
        subtitle={f.date(date, { dateStyle: 'full' })}
        actions={
          <>
            <Input label={<span className="sr-only">{t('common.date')}</span>} type="date" value={date} max={today} onChange={(e) => e.target.value && nav(`/app/day/${e.target.value}`)} />
            {!existing && lastDay && (
              <Button
                variant="secondary"
                className="self-end"
                onClick={() =>
                  setDay({
                    ...fresh(),
                    startTime: lastDay.startTime,
                    endTime: lastDay.endTime,
                    breakMinutes: lastDay.breakMinutes,
                    vehicleId: lastDay.vehicleId,
                    earnings: lastDay.earnings.map((e) => blankEarning(e.platformId)),
                  })
                }
              >
                <Copy className="h-4 w-4" aria-hidden /> {t('day.copyLast')}
              </Button>
            )}
          </>
        }
      />

      {saved && (
        <Card className="ring-2 ring-gain">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-gain" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold text-brand-900">{t('day.savedTitle')}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-slate-500">{t('dashboard.revenue')}</dt>
                <dd className="text-right font-semibold sm:text-left"><Money value={result.grossRevenue} /></dd>
                <dt className="text-slate-500">{t('dashboard.totalCosts')}</dt>
                <dd className="text-right font-semibold sm:text-left"><Money value={result.totalCosts} /></dd>
                <dt className="text-slate-500">{t('dashboard.profit')}</dt>
                <dd className="text-right font-bold sm:text-left"><Money value={result.profit} sign colored /></dd>
                <dt className="text-slate-500">{t('dashboard.perHour')}</dt>
                <dd className="text-right font-semibold sm:text-left">{f.perHour(result.profitPerHour)}</dd>
              </dl>
              <div className="mt-3 flex gap-2">
                <Link to="/app" className="text-sm font-semibold text-brand-700 underline">{t('day.backToDashboard')}</Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!activePlatforms.length && <Notice>{t('day.noPlatforms')} <Link to="/app/platforms" className="underline">{t('nav.platforms')}</Link></Notice>}

      <Card title={t('day.general')}>
        <div className="grid grid-cols-3 gap-3">
          <Input label={t('day.start')} type="time" value={day.startTime ?? ''} onChange={(e) => setTime({ startTime: e.target.value || null })} />
          <Input label={t('day.end')} type="time" value={day.endTime ?? ''} onChange={(e) => setTime({ endTime: e.target.value || null })} />
          <NumberInput label={t('day.break')} suffix="min" value={day.breakMinutes} onChange={(v) => setTime({ breakMinutes: v ?? 0 })} />
        </div>
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">
          <Clock className="mr-1.5 inline h-4 w-4 align-[-3px] text-brand-700" aria-hidden />
          {t('day.workedTime')}: <strong className="text-brand-900">{hours != null ? f.hours(hours) : t('day.workedTimeMissing')}</strong>
        </p>
      </Card>

      <Card
        title={t('day.earnings')}
        action={
          <Button variant="ghost" onClick={() => set({ earnings: [...day.earnings, blankEarning(activePlatforms.find((p) => !day.earnings.some((e) => e.platformId === p.id))?.id ?? null)] })}>
            <Plus className="h-4 w-4" aria-hidden /> {t('day.addEarning')}
          </Button>
        }
      >
        <div className="space-y-4">
          {day.earnings.map((e, idx) => {
            const r = result.earnings[idx];
            const pf = data.platforms.find((p) => p.id === e.platformId);
            return (
              <fieldset key={e.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <legend className="sr-only">{f.platformName(e.platformId)}</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-end gap-2">
                    <div className="flex-1">
                      <Select label={t('day.platform')} value={e.platformId ?? ''} onChange={(ev) => setEarning(e.id, { platformId: ev.target.value || null })}>
                        {data.platforms.filter((p) => p.active || p.id === e.platformId).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="">{t('day.directRides')}</option>
                      </Select>
                    </div>
                    {day.earnings.length > 1 && (
                      <Button variant="ghost" aria-label={t('common.delete')} onClick={() => set({ earnings: day.earnings.filter((x) => x.id !== e.id) })}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                  <MoneyInput label={t('day.gross')} currency={currency} value={e.gross} onChange={(v) => setEarning(e.id, { gross: v })} />
                  <MoneyInput
                    label={t('day.commission')}
                    currency={currency}
                    value={e.commission}
                    onChange={(v) => setEarning(e.id, { commission: v })}
                    hint={e.commission == null && r?.commissionSource === 'estimated' ? t('day.commissionEstimate', { pct: pf?.commissionPct, amount: fmt(r.commission) }) : t('day.commissionHint')}
                  />
                </div>
                {r && (
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    {t('day.lineAfter')}: <Money value={r.afterCommissions} className="font-semibold" />
                    {r.commissionSource === 'estimated' && e.gross != null && <Badge tone="warn">{t('day.commissionIsEstimated')}</Badge>}
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>
      </Card>

      <Card title={t('day.expenses')}>
        {dayExpenses.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-100">
            {dayExpenses.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {f.category(x.category)} {x.description && <span className="text-slate-500">— {x.description}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <Money value={x.amount} className="font-semibold" />
                  <button aria-label={t('common.delete')} onClick={() => remove('expenses', x.id)} className="rounded p-1 text-slate-400 hover:text-loss">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select label={t('expenses.category')} value={newExp.category} onChange={(e) => setNewExp({ ...newExp, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{f.category(c.id)}</option>
            ))}
          </Select>
          <MoneyInput label={t('expenses.amount')} currency={currency} value={newExp.amount} onChange={(v) => setNewExp({ ...newExp, amount: v })} />
          <Input label={t('expenses.description')} value={newExp.description} onChange={(e) => setNewExp({ ...newExp, description: e.target.value })} />
          <Button variant="secondary" className="self-end" disabled={!newExp.amount} onClick={addExpense}>
            <Plus className="h-4 w-4" aria-hidden /> {t('common.add')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('day.expensesHint')}</p>
      </Card>

      <Card title={t('day.summary')} className="lg:sticky lg:bottom-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {[
            ['dashboard.revenue', result.grossRevenue],
            ['dashboard.commissions', -(result.commissions + result.platformFees)],
            ['dashboard.variableExpenses', -(result.energy.cost + result.variableExpenses)],
            ['dashboard.fixedShare', -result.fixedShare],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-2 sm:block">
              <dt className="text-slate-500">{t(k as string)}</dt>
              <dd className="font-semibold"><Money value={v as number} sign={(v as number) < 0} /></dd>
            </div>
          ))}
          <div className="col-span-2 flex justify-between gap-2 border-t border-slate-200 pt-2 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
            <dt className="font-semibold text-brand-900">{t('dashboard.profit')}</dt>
            <dd className="text-lg font-bold"><Money value={result.profit} sign colored /></dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-slate-600">
          {f.perHour(result.profitPerHour)} · {t('dashboard.margin')} {f.pct(result.marginPct)}
        </p>
        {shownIssues.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {shownIssues.map((i) => (
              <li key={i}><Badge tone={issueTone(i)}>{t(`issues.${i}`)}</Badge></li>
            ))}
          </ul>
        )}
        {saveError && (
          <div className="mt-3">
            <Notice tone="loss">{t('day.saveFailed', { message: saveError })}</Notice>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="success" loading={saving} onClick={save} className="flex-1 sm:flex-none">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {existing ? t('day.update') : t('day.finish')}
          </Button>
          {existing && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (await ask({ message: t('day.confirmDelete'), danger: true, confirmLabel: t('common.delete') })) {
                  await remove('days', existing.id);
                  nav('/app/history');
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> {t('common.delete')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
