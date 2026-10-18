import type { AlertKind, ISODate, Profile, UserData } from '../domain/types';
import { addDays, monthStart } from './dates';
import type { DayResult, MonthProjection } from './finance/engine';

export interface Alert {
  kind: AlertKind;
  tone: 'info' | 'warn' | 'gain' | 'loss';
  params: Record<string, string | number>;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * In-app alerts derived only from the driver's own data. Nothing is invented: an alert fires
 * only when the underlying data exists. Push / e-mail delivery is not implemented yet.
 */
export function computeAlerts(
  profile: Profile,
  data: UserData,
  results: DayResult[],
  today: ISODate,
  projection: MonthProjection | null,
): Alert[] {
  const on = (k: AlertKind) => profile.notificationPrefs?.[k] !== false;
  const out: Alert[] = [];
  const todayResult = results.find((r) => r.date === today);

  if (on('dailyReminder') && !todayResult) out.push({ kind: 'dailyReminder', tone: 'info', params: {} });

  if (on('dailyGoalReached') && todayResult && profile.dailyGoal && todayResult.profit >= profile.dailyGoal)
    out.push({ kind: 'dailyGoalReached', tone: 'gain', params: {} });

  if (on('monthlyGoalBehind') && projection?.gapToGoal != null && projection.gapToGoal < 0 && projection.workedDays >= 3)
    out.push({ kind: 'monthlyGoalBehind', tone: 'warn', params: { gap: -projection.gapToGoal } });

  if (on('unusualExpense')) {
    const recent = data.expenses.filter((e) => e.date >= addDays(today, -7));
    for (const e of recent) {
      const same = data.expenses.filter((x) => x.category === e.category && x.id !== e.id).map((x) => x.amount);
      if (same.length >= 5 && e.amount > 3 * median(same)) out.push({ kind: 'unusualExpense', tone: 'warn', params: { category: e.category, amount: e.amount, date: e.date } });
    }
  }

  if (on('hourlyDecline')) {
    const window = (from: ISODate, to: ISODate) => {
      const ds = results.filter((r) => r.date >= from && r.date <= to && r.hours);
      const h = ds.reduce((a, r) => a + (r.hours ?? 0), 0);
      return ds.length >= 3 && h > 0 ? ds.reduce((a, r) => a + r.profit, 0) / h : null;
    };
    const last = window(addDays(today, -6), today);
    const prev = window(addDays(today, -13), addDays(today, -7));
    if (last != null && prev != null && prev > 0 && last < prev * 0.85)
      out.push({ kind: 'hourlyDecline', tone: 'warn', params: { pct: Math.round((1 - last / prev) * 100) } });
  }

  for (const v of data.vehicles.filter((x) => !x.archived)) {
    if (on('maintenanceDue') && v.maintenanceIntervalKm && v.lastMaintenanceKm != null) {
      const lastOdo = Math.max(v.odometer ?? 0, ...data.days.filter((d) => d.vehicleId === v.id).map((d) => d.odoEnd ?? 0));
      const left = v.lastMaintenanceKm + v.maintenanceIntervalKm - lastOdo;
      if (left <= 1000) out.push({ kind: 'maintenanceDue', tone: left <= 0 ? 'loss' : 'warn', params: { vehicle: v.name, km: Math.max(0, Math.round(left)) } });
    }
    if (on('documentExpiry'))
      for (const [field, date] of [['insurance', v.insuranceExpiry], ['documents', v.documentsExpiry]] as const)
        if (date && date <= addDays(today, 30))
          out.push({ kind: 'documentExpiry', tone: date < today ? 'loss' : 'warn', params: { vehicle: v.name, doc: field, date } });
  }
  return out;
}

export const monthRange = (today: ISODate) => ({ from: monthStart(today), to: today });
