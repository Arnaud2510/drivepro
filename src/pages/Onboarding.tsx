import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useStore, defaultProfile } from '../data/store';
import { newId } from '../data/repository';
import { ACTIVITIES, CURRENCIES, FUEL_TYPES, LANGUAGES, VEHICLE_TYPES } from '../config/catalog';
import { useCatalog } from '../data/catalog';
import type { FuelType, Lang, Profile, Vehicle, VehicleType } from '../domain/types';
import { Button, Input, MoneyInput, Notice, NumberInput, Select, cx } from '../components/ui';
import { Logo } from '../components/Logo';
import { ModeBanner } from '../components/Layout';
import { takeReturn } from '../lib/returnTo';

const STEPS = ['profile', 'activity', 'platforms', 'vehicle', 'finance'] as const;

export function Onboarding() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { profile: existing, session, saveProfile, upsert, data } = useStore();
  const { countries: COUNTRIES, platforms: PLATFORM_CATALOG, countryByCode } = useCatalog();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(() => existing ?? { ...defaultProfile(session?.user.id ?? 'local'), language: i18n.language.slice(0, 2) as Lang });
  const [selected, setSelected] = useState<Record<string, number | null>>({});
  const [custom, setCustom] = useState('');
  const [veh, setVeh] = useState({ name: '', type: 'car' as VehicleType, fuelType: 'petrol' as FuelType, consumption: null as number | null, energyPrice: null as number | null });
  const [saving, setSaving] = useState(false);
  const country = countryByCode(p.countryCode);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));

  const suggested = country?.suggestedPlatforms ?? [];
  const others = PLATFORM_CATALOG.filter((c) => !suggested.includes(c.id));

  async function finish() {
    setSaving(true);
    try {
      for (const id of Object.keys(selected)) {
        const cat = PLATFORM_CATALOG.find((c) => c.id === id);
        await upsert('platforms', { id: newId(), name: cat?.name ?? id, catalogId: cat ? id : null, commissionPct: null, notes: '', active: true });
      }
      if (veh.name.trim()) {
        const v: Vehicle = {
          id: newId(), name: veh.name.trim(), make: '', model: '', year: null, type: veh.type, fuelType: veh.fuelType,
          consumption: veh.consumption, energyPrice: veh.energyPrice, tankCapacity: null, odometer: null, purchasePrice: null,
          financing: 'owned', maintenanceIntervalKm: null, lastMaintenanceKm: null, insuranceExpiry: null, documentsExpiry: null, notes: '', archived: false,
        };
        await upsert('vehicles', v);
      }
      await saveProfile({ ...p, onboarded: true });
      nav(takeReturn());
    } finally {
      setSaving(false);
    }
  }

  const canNext = step !== 0 || (p.countryCode && p.currency && p.timezone);

  return (
    <div className="min-h-dvh bg-slate-50">
      <ModeBanner />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Logo />
        <ol className="mt-6 flex gap-2" aria-label={t('onboarding.progress')}>
          {STEPS.map((s, i) => (
            <li key={s} className={cx('h-2 flex-1 rounded-full', i <= step ? 'bg-brand-800' : 'bg-slate-200')}>
              <span className="sr-only">
                {t(`onboarding.steps.${s}`)} {i < step ? '✓' : ''}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-500">
          {t('onboarding.stepOf', { n: step + 1, total: STEPS.length })} · {t(`onboarding.steps.${STEPS[step]}`)}
        </p>
        <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <h1 className="text-2xl font-bold text-brand-900 sm:col-span-2">{t('onboarding.welcome')}</h1>
              <Input label={t('profile.displayName')} value={p.displayName} onChange={(e) => set({ displayName: e.target.value })} />
              <Select
                label={t('profile.country')}
                value={p.countryCode}
                onChange={(e) => {
                  const c = countryByCode(e.target.value);
                  set({ countryCode: e.target.value, currency: c?.currency ?? p.currency, timezone: c?.timezone ?? p.timezone });
                  setSelected({});
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(`countries.${c.code}`, { defaultValue: c.code })}
                  </option>
                ))}
              </Select>
              <Input label={t('profile.city')} value={p.city} onChange={(e) => set({ city: e.target.value })} />
              <Select
                label={t('settings.language')}
                value={p.language}
                onChange={(e) => {
                  set({ language: e.target.value as Lang });
                  i18n.changeLanguage(e.target.value);
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
              <Select label={t('settings.currency')} value={p.currency} onChange={(e) => set({ currency: e.target.value })} hint={t('settings.currencyHint')}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Input label={t('settings.timezone')} value={p.timezone} onChange={(e) => set({ timezone: e.target.value })} />
            </div>
          )}
          {step === 1 && (
            <fieldset>
              <legend className="mb-4 text-xl font-bold text-brand-900">{t('onboarding.activityQ')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTIVITIES.map((a) => {
                  const on = p.activities.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ activities: on ? p.activities.filter((x) => x !== a) : [...p.activities, a] })}
                      className={cx('flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-sm font-medium ring-1', on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white text-slate-700 ring-slate-300')}
                    >
                      {t(`activities.${a}`)}
                      {on && <Check className="h-4 w-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-brand-900">{t('onboarding.platformsQ')}</h2>
              <Notice>{t('onboarding.platformsNotice')}</Notice>
              {[
                { title: t('onboarding.suggested', { country: t(`countries.${p.countryCode}`, { defaultValue: p.countryCode }) }), list: PLATFORM_CATALOG.filter((c) => suggested.includes(c.id)) },
                { title: t('onboarding.otherPlatforms'), list: others },
              ].map((g) => (
                <div key={g.title}>
                  <p className="mb-2 text-sm font-semibold text-slate-600">{g.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.list.map((c) => {
                      const on = c.id in selected;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSelected((s) => {
                              const n = { ...s };
                              if (on) delete n[c.id];
                              else n[c.id] = null;
                              return n;
                            })
                          }
                          className={cx('min-h-10 rounded-full px-4 text-sm font-medium ring-1', on ? 'bg-brand-900 text-white ring-brand-900' : 'bg-white ring-slate-300')}
                        >
                          {on && '✓ '}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input label={t('onboarding.customPlatform')} value={custom} onChange={(e) => setCustom(e.target.value)} />
                </div>
                <Button
                  variant="secondary"
                  className="self-end"
                  disabled={!custom.trim()}
                  onClick={() => {
                    setSelected((s) => ({ ...s, [custom.trim()]: null }));
                    setCustom('');
                  }}
                >
                  {t('common.add')}
                </Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <h2 className="text-xl font-bold text-brand-900 sm:col-span-2">{t('onboarding.vehicleQ')}</h2>
              {data.vehicles.length > 0 && <Notice>{t('onboarding.vehicleExists', { count: data.vehicles.length })}</Notice>}
              <Input label={t('vehicles.name')} placeholder={t('vehicles.namePlaceholder')} value={veh.name} onChange={(e) => setVeh({ ...veh, name: e.target.value })} />
              <Select label={t('vehicles.type')} value={veh.type} onChange={(e) => setVeh({ ...veh, type: e.target.value as VehicleType })}>
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`vehicleTypes.${v}`)}
                  </option>
                ))}
              </Select>
              <Select label={t('vehicles.fuelType')} value={veh.fuelType} onChange={(e) => setVeh({ ...veh, fuelType: e.target.value as FuelType })}>
                {FUEL_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`fuelTypes.${v}`)}
                  </option>
                ))}
              </Select>
              <NumberInput label={t('vehicles.consumption')} suffix={veh.fuelType === 'electric' ? 'kWh/100 km' : 'L/100 km'} value={veh.consumption} onChange={(v) => setVeh({ ...veh, consumption: v })} />
              <NumberInput
                label={veh.fuelType === 'electric' ? t('vehicles.kwhPrice') : t('vehicles.fuelPrice')}
                suffix={`${p.currency}/${veh.fuelType === 'electric' ? 'kWh' : 'L'}`}
                value={veh.energyPrice}
                onChange={(v) => setVeh({ ...veh, energyPrice: v })}
                hint={t('vehicles.priceHint')}
              />
              <p className="text-sm text-slate-500 sm:col-span-2">{t('onboarding.skipHint')}</p>
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <h2 className="text-xl font-bold text-brand-900 sm:col-span-2">{t('onboarding.financeQ')}</h2>
              <MoneyInput label={t('goals.daily')} currency={p.currency} value={p.dailyGoal} onChange={(v) => set({ dailyGoal: v })} />
              <MoneyInput label={t('goals.monthly')} currency={p.currency} value={p.monthlyGoal} onChange={(v) => set({ monthlyGoal: v })} />
              <NumberInput label={t('settings.plannedWorkDays')} value={p.plannedWorkDays} max={31} onChange={(v) => set({ plannedWorkDays: v ?? 22 })} />
              <Select label={t('settings.energyMode')} value={p.defaultEnergyMode} onChange={(e) => set({ defaultEnergyMode: e.target.value as Profile['defaultEnergyMode'] })} hint={t('settings.energyModeHint')}>
                <option value="estimated">{t('energyMode.estimated')}</option>
                <option value="actual">{t('energyMode.actual')}</option>
              </Select>
              <p className="text-sm text-slate-500 sm:col-span-2">{t('onboarding.editLater')}</p>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-between gap-3">
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t('common.back')}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button variant="success" loading={saving} onClick={finish}>
              {t('onboarding.finish')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
