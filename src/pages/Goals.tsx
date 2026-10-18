import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../data/store';
import { useFormat, useToday } from '../components/hooks';
import { Button, Card, Money, MoneyInput, Notice, NumberInput, PageHeader, Stat, Toggle, Input, useMoney } from '../components/ui';
import { Progress } from '../components/charts';
import { computePeriod, projectMonth, taxProvision } from '../lib/finance/engine';
import { monthStart } from '../lib/dates';

export function Goals() {
  const { t } = useTranslation();
  const { profile, dataset, saveProfile } = useStore();
  const today = useToday();
  const f = useFormat();
  const { currency, fmt } = useMoney();
  const [method, setMethod] = useState<'pace' | 'planned'>('pace');
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);

  const month = useMemo(() => (dataset ? computePeriod(dataset, monthStart(today), today) : null), [dataset, today]);
  const proj = useMemo(() => (dataset ? projectMonth(dataset, today, method, profile?.monthlyGoal ?? null) : null), [dataset, today, method, profile]);
  if (!profile || !draft || !month || !proj) return null;
  const tax = taxProvision(month.profit, profile.taxProvisionPct);
  const remainingDays = Math.max(0, Math.round(proj.expectedRemainingWorkDays));
  const neededPerDay = profile.monthlyGoal && remainingDays > 0 ? Math.max(0, (profile.monthlyGoal - month.profit) / remainingDays) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={t('goals.title')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('goals.monthStatus')}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('goals.actual')} value={<Money value={month.profit} sign />} tone={month.profit >= 0 ? 'gain' : 'loss'} sub={t('dashboard.workedDays', { count: month.workedDays })} />
            <Stat label={t('goals.projected')} value={proj.projectedProfit != null ? <Money value={proj.projectedProfit} sign /> : t('common.insufficientData')} estimated />
          </div>
          <div className="mt-4">
            <Toggle label={t('goals.projectionMethod')} value={method} onChange={setMethod} options={[{ value: 'pace', label: t('goals.pace') }, { value: 'planned', label: t('goals.planned') }]} />
            <p className="mt-2 text-xs text-slate-500">{method === 'pace' ? t('goals.paceHelp', { worked: proj.workedDays, elapsed: proj.elapsedDays }) : t('goals.plannedHelp', { planned: profile.plannedWorkDays })}</p>
          </div>
          {profile.monthlyGoal ? (
            <div className="mt-4 space-y-2">
              <Progress value={month.profit} max={profile.monthlyGoal} label={t('goals.monthlyProgress')} />
              {proj.gapToGoal != null && (
                <Notice tone={proj.gapToGoal >= 0 ? 'gain' : 'warn'}>
                  {proj.gapToGoal >= 0 ? t('goals.onTrack', { amount: fmt(proj.gapToGoal) }) : t('goals.behind', { amount: fmt(-proj.gapToGoal) })}
                  {neededPerDay != null && proj.gapToGoal < 0 && <> {t('goals.neededPerDay', { amount: fmt(Math.round(neededPerDay)), days: remainingDays })}</>}
                </Notice>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{t('goals.noGoal')}</p>
          )}
          <p className="mt-3 text-xs italic text-slate-500">{t('goals.projectionDisclaimer')}</p>
        </Card>

        <Card title={t('tax.title')}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>{t('tax.before')}</dt><dd className="font-semibold"><Money value={tax.beforeTax} sign /></dd></div>
            <div className="flex justify-between"><dt>{t('tax.provision')} {tax.configured && `(${profile.taxProvisionPct} %)`}</dt><dd className="font-semibold">{tax.configured ? <Money value={-tax.provision} sign /> : t('tax.notConfigured')}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="font-semibold">{t('tax.after')}</dt><dd className="font-bold"><Money value={tax.afterProvision} sign colored /></dd></div>
          </dl>
          <Notice tone="warn">{t('tax.disclaimer')}</Notice>
        </Card>
      </div>

      <Card title={t('goals.settings')}>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveProfile(draft);
            setSaved(true);
          }}
        >
          <MoneyInput label={t('goals.daily')} currency={currency} value={draft.dailyGoal} onChange={(v) => setDraft({ ...draft, dailyGoal: v })} />
          <MoneyInput label={t('goals.monthly')} currency={currency} value={draft.monthlyGoal} onChange={(v) => setDraft({ ...draft, monthlyGoal: v })} />
          <NumberInput label={t('settings.plannedWorkDays')} value={draft.plannedWorkDays} max={31} onChange={(v) => setDraft({ ...draft, plannedWorkDays: v ?? 22 })} />
          <NumberInput label={t('tax.rate')} suffix="%" max={100} value={draft.taxProvisionPct} onChange={(v) => setDraft({ ...draft, taxProvisionPct: v })} hint={t('tax.rateHint')} />
          <div className="sm:col-span-2 lg:col-span-4">
            <Input label={t('tax.note')} value={draft.taxNote} onChange={(e) => setDraft({ ...draft, taxNote: e.target.value })} hint={t('tax.noteHint')} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <Button type="submit">{t('common.save')}</Button>
            {saved && <span className="text-sm text-gain">✓ {t('common.saved')}</span>}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">{f.hours(month.hours)} · {f.perHour(month.profitPerHour)}</p>
      </Card>
    </div>
  );
}
