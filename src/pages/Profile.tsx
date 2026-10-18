import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2 } from 'lucide-react';
import { useStore } from '../data/store';
import { ALERT_KINDS, COUNTRIES, CURRENCIES, LANGUAGES, countryByCode } from '../config/catalog';
import type { FixedCostMethod, Lang, Profile as P } from '../domain/types';
import { Button, Card, Checkbox, Input, Notice, NumberInput, PageHeader, Select } from '../components/ui';
import { download } from '../lib/csv';
import { useToday } from '../components/hooks';

export function Profile() {
  const { t } = useTranslation();
  const { profile, saveProfile, data, mode, session, deleteAccount } = useStore();
  const today = useToday();
  const [p, setP] = useState<P | null>(profile);
  const [saved, setSaved] = useState(false);
  if (!p || !profile) return null;
  const set = (patch: Partial<P>) => {
    setP({ ...p, ...patch });
    setSaved(false);
  };
  const hasAmounts = data.days.length + data.expenses.length + data.fixedCosts.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader title={t('profile.title')} subtitle={mode === 'supabase' ? session?.user.email : t(`mode.${mode}`)} />
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveProfile(p);
          setSaved(true);
        }}
      >
        <Card title={t('profile.identity')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input label={t('profile.displayName')} value={p.displayName} onChange={(e) => set({ displayName: e.target.value })} />
            <Select label={t('profile.country')} value={p.countryCode} onChange={(e) => set({ countryCode: e.target.value, timezone: countryByCode(e.target.value)?.timezone ?? p.timezone })}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{t(`countries.${c.code}`)}</option>)}
            </Select>
            <Input label={t('profile.city')} value={p.city} onChange={(e) => set({ city: e.target.value })} />
          </div>
        </Card>
        <Card title={t('settings.title')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select label={t('settings.language')} value={p.language} onChange={(e) => set({ language: e.target.value as Lang })}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </Select>
            <Select label={t('settings.currency')} value={p.currency} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Input label={t('settings.timezone')} value={p.timezone} onChange={(e) => set({ timezone: e.target.value })} hint={t('settings.timezoneHint', { today })} />
            <Select label={t('settings.fixedMethod')} value={p.fixedCostMethod} onChange={(e) => set({ fixedCostMethod: e.target.value as FixedCostMethod })} hint={t(`fixedMethodHelp.${p.fixedCostMethod}`)}>
              {(['calendar_day', 'worked_day', 'separate'] as const).map((m) => <option key={m} value={m}>{t(`fixedMethod.${m}`)}</option>)}
            </Select>
            <NumberInput label={t('settings.plannedWorkDays')} value={p.plannedWorkDays} max={31} onChange={(v) => set({ plannedWorkDays: v ?? 22 })} />
            <Select label={t('settings.energyMode')} value={p.defaultEnergyMode} onChange={(e) => set({ defaultEnergyMode: e.target.value as P['defaultEnergyMode'] })} hint={t('settings.energyModeHint')}>
              <option value="estimated">{t('energyMode.estimated')}</option>
              <option value="actual">{t('energyMode.actual')}</option>
            </Select>
          </div>
          {p.currency !== profile.currency && hasAmounts && <div className="mt-3"><Notice tone="warn">{t('settings.currencyChangeWarning')}</Notice></div>}
        </Card>
        <Card title={t('alerts.prefs')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALERT_KINDS.map((k) => (
              <Checkbox key={k} checked={p.notificationPrefs?.[k] !== false} onChange={(v) => set({ notificationPrefs: { ...p.notificationPrefs, [k]: v } })} label={t(`alertNames.${k}`)} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('alerts.inAppOnly')}</p>
        </Card>
        <div className="flex items-center gap-3">
          <Button type="submit">{t('common.save')}</Button>
          {saved && <span className="text-sm text-gain">✓ {t('common.saved')}</span>}
        </div>
      </form>

      <Card title={t('profile.privacy')}>
        <p className="text-sm text-slate-600">{t('profile.privacyText')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download(`drivepro-export-${today}.json`, JSON.stringify(data, null, 2), 'application/json')}>
            <Download className="h-4 w-4" aria-hidden /> {t('profile.exportData')}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (prompt(t('profile.deleteConfirm')) === 'DELETE') await deleteAccount();
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> {mode === 'supabase' ? t('profile.deleteAccount') : t('profile.deleteLocal')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
