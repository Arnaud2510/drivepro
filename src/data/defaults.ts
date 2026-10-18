import type { Profile } from '../domain/types';
import { ALERT_KINDS, countryByCode } from '../config/catalog';

export function defaultProfile(id: string, countryCode = 'FR'): Profile {
  const c = countryByCode(countryCode);
  const browserLang = (navigator.language || 'fr').slice(0, 2);
  const lang = (['fr', 'en', 'es', 'pt', 'de', 'it'].includes(browserLang) ? browserLang : c?.defaultLanguage ?? 'fr') as Profile['language'];
  return {
    id,
    displayName: '',
    countryCode,
    city: '',
    language: lang,
    currency: c?.currency ?? 'EUR',
    timezone: c?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    activities: [],
    dailyGoal: null,
    monthlyGoal: null,
    fixedCostMethod: 'calendar_day',
    plannedWorkDays: 22,
    defaultEnergyMode: 'estimated',
    taxProvisionPct: null,
    taxNote: '',
    notificationPrefs: Object.fromEntries(ALERT_KINDS.map((k) => [k, true])) as Profile['notificationPrefs'],
    reminderTime: '20:00',
    onboarded: false,
  };
}

/**
 * Completes a stored profile with defaults. A server-side profile row is created empty at
 * sign-up (no country, UTC), so until onboarding is finished the browser/country defaults win.
 */
export function normalizeProfile(p: Profile): Profile {
  if (!p.onboarded) return { ...defaultProfile(p.id), displayName: p.displayName ?? '' };
  const base = defaultProfile(p.id, p.countryCode || 'FR');
  const set = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
  return { ...base, ...set, notificationPrefs: { ...base.notificationPrefs, ...(p.notificationPrefs ?? {}) } } as Profile;
}
