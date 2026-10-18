import { useTranslation } from 'react-i18next';
import { useStore } from '../data/store';
import { todayIn } from '../lib/dates';
import { formatRate, formatNumber } from '../lib/money';
import { formatDate } from '../lib/dates';

export function useToday() {
  const { profile } = useStore();
  return todayIn(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function useFormat() {
  const { t } = useTranslation();
  const { profile, locale, data } = useStore();
  const currency = profile?.currency ?? 'EUR';
  return {
    perHour: (v: number | null) => (v == null ? t('common.insufficientData') : `${formatRate(v, currency, locale, 0)}/h`),
    perKm: (v: number | null) => (v == null ? t('common.insufficientData') : `${formatRate(v, currency, locale, 1)}/km`),
    pct: (v: number | null) => (v == null ? t('common.notComputable') : `${formatNumber(v, locale, 1)} %`),
    km: (v: number | null) => (v == null ? '—' : `${formatNumber(v, locale, 0)} km`),
    hours: (v: number | null) => (v == null ? '—' : `${formatNumber(v, locale, 1)} h`),
    date: (d: string, opts?: Intl.DateTimeFormatOptions) => formatDate(d, locale, opts),
    platformName: (id: string | null) =>
      id === null || id === 'direct' ? t('day.directRides') : data.platforms.find((p) => p.id === id)?.name ?? t('common.deleted'),
    vehicleName: (id: string | null) => (id === null || id === 'none' ? t('day.noVehicle') : data.vehicles.find((v) => v.id === id)?.name ?? t('common.deleted')),
    category: (c: string) => t(`categories.${c}`, { defaultValue: c }),
  };
}
