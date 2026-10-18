import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { useStore } from '../data/store';
import { newId } from '../data/repository';
import type { Earning, EnergyMode, Expense, WorkDay } from '../domain/types';
import { computeDay, fixedShareForDay } from '../lib/finance/engine';
import { useFormat, useToday } from '../components/hooks';
import { Badge, Button, Card, Checkbox, Input, Money, MoneyInput, Notice, NumberInput, PageHeader, Select, Toggle, useMoney } from '../components/ui';
import { EXPENSE_CATEGORIES } from '../config/catalog';

const blankEarning = (platformId: string | null): Earning => ({
  id: newId(), platformId, label: '', grossKnown: true, gross: null, commission: null, otherFees: 0,
  bonus: 0, bonusIncluded: false, tips: 0, tipsIncluded: false, netPaid: null, payoutStatus: 'pending',
});

export function DayEntry() {
  const { t } = useTranslation();
  const params = useParams();
  const nav = useNavigate();
  const today = useToday();
  const { data, profile, upsert, remove } = useStore();
  const { currency, fmt } = useMoney();
  const f = useFormat();
  const date = params.date ?? today;
  const existing = data.days.find((d) => d.date === date);
  const lastDay = [...data.days].filter((d) => d.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeVehicles = data.vehicles.filter((v) => !v.archived);
  const activePlatforms = data.platforms.filter((p) => p.active);

  const fresh = (): WorkDay => {
    const vehicleId = lastDay?.vehicleId ?? activeVehicles[0]?.id ?? null;
    const lastOdo = vehicleId ? Math.max(0, ...data.days.filter((d) => d.vehicleId === vehicleId && d.date < date).map((d) => d.odoEnd ?? 0)) : 0;
    return {
      id: newId(), date, startTime: null, endTime: null, breakMinutes: 0, hoursOverride: null, vehicleId,
      odoStart: lastOdo || data.vehicles.find((v) => v.id === vehicleId)?.odometer || null, odoEnd: null, distanceKm: null, personalKm: 0,
      trips: null, deliveries: null, energyMode: profile?.defaultEnergyMode ?? 'estimated',
      earnings: activePlatforms.length ? [blankEarning(activePlatforms[0].id)] : [blankEarning(null)], notes: '',
    };
  };
  const [day, setDay] = useState<WorkDay>(() => existing ?? fresh());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newExp, setNewExp] = useState({ category: 'fuel', amount: null as number | null, description: '' });

  // Re-initialise when the date in the URL changes
  useEffect(() => {
    setDay(existing ?? fresh());
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.id]);

  const set = (patch: Partial<WorkDay>) => setDay((d) => ({ ...d, ...patch }));
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
    try {
      await upsert('days', day);
      if (vehicle && day.odoEnd && (vehicle.odometer ?? 0) < day.odoEnd) await upsert('vehicles', { ...vehicle, odometer: day.odoEnd });
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  async function addExpense() {
    if (!newExp.amount) return;
    const e: Expense = {
      id: newId(), date, category: newExp.category, amount: newExp.amount, description: newExp.description,
      vehicleId: day.vehicleId, paymentMethod: 'cash', kind: EXPENSE_CATEGORIES.find((c) => c.id === newExp.category)?.defaultKind ?? 'daily', receiptPath: null,
    };
    await upsert('expenses', e);
    setNewExp({ ...newExp, amount: null, description: '' });
  }

  const issueTone = (i: string) => (['odometerInverted', 'netPaidMismatch'].includes(i) ? 'loss' : 'warn');
  const energyLabel = vehicle?.fuelType === 'electric' ? t('day.energyCharging') : t('day.energyFuel');

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
                    energyMode: lastDay.energyMode,
                    earnings: lastDay.earnings.map((e) => ({ ...blankEarning(e.platformId), grossKnown: e.grossKnown, bonusIncluded: e.bonusIncluded, tipsIncluded: e.tipsIncluded })),
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label={t('day.start')} type="time" value={day.startTime ?? ''} onChange={(e) => set({ startTime: e.target.value || null })} />
          <Input label={t('day.end')} type="time" value={day.endTime ?? ''} onChange={(e) => set({ endTime: e.target.value || null })} />
          <NumberInput label={t('day.break')} suffix="min" value={day.breakMinutes} onChange={(v) => set({ breakMinutes: v ?? 0 })} />
          <NumberInput label={t('day.activeHours')} suffix="h" max={24} value={day.hoursOverride} onChange={(v) => set({ hoursOverride: v })} hint={t('day.activeHoursHint')} />
          <div className="col-span-2">
            <Select label={t('day.vehicle')} value={day.vehicleId ?? ''} onChange={(e) => set({ vehicleId: e.target.value || null })}>
              <option value="">{t('day.noVehicle')}</option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
          <NumberInput label={t('day.trips')} value={day.trips} onChange={(v) => set({ trips: v })} />
          <NumberInput label={t('day.deliveries')} value={day.deliveries} onChange={(v) => set({ deliveries: v })} />
          <NumberInput label={t('day.odoStart')} suffix="km" value={day.odoStart} onChange={(v) => set({ odoStart: v })} />
          <NumberInput label={t('day.odoEnd')} suffix="km" value={day.odoEnd} onChange={(v) => set({ odoEnd: v })} />
          <NumberInput label={t('day.distanceDirect')} suffix="km" value={day.distanceKm} onChange={(v) => set({ distanceKm: v })} hint={t('day.distanceDirectHint')} />
          <NumberInput label={t('day.personalKm')} suffix="km" value={day.personalKm} onChange={(v) => set({ personalKm: v ?? 0 })} />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {t('day.computed')}: <strong>{f.hours(result.hours)}</strong> · <strong>{f.km(result.businessKm)}</strong> {t('day.businessKm')}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="col-span-2">
                    <Select label={t('day.platform')} value={e.platformId ?? ''} onChange={(ev) => setEarning(e.id, { platformId: ev.target.value || null })}>
                      {data.platforms.filter((p) => p.active || p.id === e.platformId).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                      <option value="">{t('day.directRides')}</option>
                    </Select>
                  </div>
                  <Select label={t('day.payoutStatus')} value={e.payoutStatus} onChange={(ev) => setEarning(e.id, { payoutStatus: ev.target.value as Earning['payoutStatus'] })}>
                    {(['estimated', 'pending', 'received'] as const).map((s) => (
                      <option key={s} value={s}>{t(`payout.${s}`)}</option>
                    ))}
                  </Select>
                  <div className="flex items-end justify-end">
                    {day.earnings.length > 1 && (
                      <Button variant="ghost" aria-label={t('common.delete')} onClick={() => set({ earnings: day.earnings.filter((x) => x.id !== e.id) })}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <Checkbox checked={!e.grossKnown} onChange={(v) => setEarning(e.id, { grossKnown: !v })} label={t('day.onlyNetKnown')} hint={t('day.onlyNetKnownHint')} />
                  </div>
                  {e.grossKnown && (
                    <>
                      <MoneyInput label={t('day.gross')} currency={currency} value={e.gross} onChange={(v) => setEarning(e.id, { gross: v })} />
                      <MoneyInput
                        label={t('day.commission')}
                        currency={currency}
                        value={e.commission}
                        onChange={(v) => setEarning(e.id, { commission: v })}
                        hint={
                          e.commission == null
                            ? r?.commissionSource === 'estimated'
                              ? t('day.commissionEstimate', { pct: pf?.commissionPct, amount: fmt(r.commission) })
                              : r?.commissionSource === 'derived'
                                ? t('day.commissionDerived', { amount: fmt(r.commission) })
                                : t('day.commissionUnknownHint')
                            : undefined
                        }
                      />
                      <MoneyInput label={t('day.otherFees')} currency={currency} value={e.otherFees} onChange={(v) => setEarning(e.id, { otherFees: v ?? 0 })} />
                    </>
                  )}
                  <MoneyInput label={t('day.netPaid')} currency={currency} value={e.netPaid} onChange={(v) => setEarning(e.id, { netPaid: v })} hint={e.grossKnown ? t('day.netPaidHint') : undefined} />
                  {e.grossKnown && (
                    <>
                      <div className="space-y-2">
                        <MoneyInput label={t('day.bonus')} currency={currency} value={e.bonus} onChange={(v) => setEarning(e.id, { bonus: v ?? 0 })} />
                        <Checkbox checked={e.bonusIncluded} onChange={(v) => setEarning(e.id, { bonusIncluded: v })} label={t('day.includedInGross')} />
                      </div>
                      <div className="space-y-2">
                        <MoneyInput label={t('day.tips')} currency={currency} value={e.tips} onChange={(v) => setEarning(e.id, { tips: v ?? 0 })} />
                        <Checkbox checked={e.tipsIncluded} onChange={(v) => setEarning(e.id, { tipsIncluded: v })} label={t('day.includedInGross')} />
                      </div>
                    </>
                  )}
                </div>
                {r && (
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    {t('day.lineRevenue')}: <Money value={r.revenue} className="font-semibold" /> · {t('day.lineAfter')}: <Money value={r.afterCommissions} className="font-semibold" />
                    {r.commissionSource === 'estimated' && <Badge tone="warn">{t('day.commissionIsEstimated')}</Badge>}
                    {r.grossUnknown && <Badge tone="warn">{t('issues.grossUnknown')}</Badge>}
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>
      </Card>

      <Card title={t('day.energy')}>
        <Toggle<EnergyMode>
          label={t('settings.energyMode')}
          value={day.energyMode}
          onChange={(v) => set({ energyMode: v })}
          options={[
            { value: 'estimated', label: t('energyMode.estimated') },
            { value: 'actual', label: t('energyMode.actual') },
          ]}
        />
        <p className="mt-2 text-sm text-slate-600">{day.energyMode === 'estimated' ? t('day.energyEstimatedHelp') : t('day.energyActualHelp')}</p>
        <p className="mt-2 text-sm">
          {energyLabel}: <Money value={result.energy.cost} className="font-semibold" />{' '}
          {result.energy.source === 'estimated' && result.energy.quantity != null && (
            <span className="text-slate-500">
              ({f.km(result.businessKm)} × {vehicle?.consumption} {result.energy.unit}/100 km = {result.energy.quantity.toFixed(2)} {result.energy.unit}) <Badge tone="warn">{t('common.estimated')}</Badge>
            </span>
          )}
          {result.energy.source === 'missing' && <span className="text-warn"> {t('issues.energyEstimateMissing')}</span>}
        </p>
        {result.ignoredEnergyExpenses > 0 && <p className="mt-1 text-xs text-slate-500">{t('dashboard.ignoredEnergy', { amount: fmt(result.ignoredEnergyExpenses) })}</p>}
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
            {EXPENSE_CATEGORIES.map((c) => (
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
            [vehicle?.fuelType === 'electric' ? 'day.energyCharging' : 'day.energyFuel', -result.energy.cost],
            ['dashboard.variableExpenses', -result.variableExpenses],
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
          {f.perHour(result.profitPerHour)} · {f.perKm(result.profitPerKm)} · {t('dashboard.margin')} {f.pct(result.marginPct)}
        </p>
        {result.issues.filter((i) => i !== 'commissionEstimated').length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.issues.filter((i) => i !== 'commissionEstimated').map((i) => (
              <li key={i}><Badge tone={issueTone(i)}>{t(`issues.${i}`)}</Badge></li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="success" loading={saving} onClick={save} className="flex-1 sm:flex-none">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {existing ? t('day.update') : t('day.finish')}
          </Button>
          {existing && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (confirm(t('day.confirmDelete'))) {
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
