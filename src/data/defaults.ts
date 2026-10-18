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
    onboarded: false,
  };
}
