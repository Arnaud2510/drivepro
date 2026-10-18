import type { AlertKind, ISODate, Profile, UserData } from '../domain/types';
import { addDays, addMonths, monthEnd, monthStart, weekStart } from './dates';
import { computePeriod, type DataSet, type DayResult, type MonthProjection } from './finance/engine';

export type NotificationKind = AlertKind | 'weeklySummary' | 'monthlySummary';

export interface Alert {
  kind: NotificationKind;
  /** Stable identity used to store read state and avoid duplicates. */
  key: string;
  tone: 'info' | 'warn' | 'gain' | 'loss';
  params: Record<string, string | number>;
  /** Transient alerts describe the current state and are never stored (e.g. "enter today"). */
  transient?: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Alerts derived only from the driver's own data. Nothing is invented: an alert fires only
 * when the underlying data exists.
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

  if (on('dailyReminder') && !todayResult)
    out.push({ kind: 'dailyReminder', key: `dailyReminder:${today}`, tone: 'info', params: {}, transient: true });

  if (on('dailyGoalReached') && todayResult && profile.dailyGoal && todayResult.profit >= profile.dailyGoal)
    out.push({ kind: 'dailyGoalReached', key: `dailyGoalReached:${today}`, tone: 'gain', params: {} });

  if (on('monthlyGoalBehind') && projection?.gapToGoal != null && projection.gapToGoal < 0 && projection.workedDays >= 3)
    out.push({ kind: 'monthlyGoalBehind', key: `monthlyGoalBehind:${today.slice(0, 7)}`, tone: 'warn', params: { gap: -projection.gapToGoal } });

  if (on('unusualExpense')) {
    const recent = data.expenses.filter((e) => e.date >= addDays(today, -7));
    for (const e of recent) {
      const same = data.expenses.filter((x) => x.category === e.category && x.id !== e.id).map((x) => x.amount);
      if (same.length >= 5 && e.amount > 3 * median(same))
        out.push({ kind: 'unusualExpense', key: `unusualExpense:${e.id}`, tone: 'warn', params: { category: e.category, amount: e.amount, date: e.date } });
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
      out.push({ kind: 'hourlyDecline', key: `hourlyDecline:${weekStart(today)}`, tone: 'warn', params: { pct: Math.round((1 - last / prev) * 100) } });
  }

  for (const v of data.vehicles.filter((x) => !x.archived)) {
    if (on('maintenanceDue') && v.maintenanceIntervalKm && v.lastMaintenanceKm != null) {
      const lastOdo = Math.max(v.odometer ?? 0, ...data.days.filter((d) => d.vehicleId === v.id).map((d) => d.odoEnd ?? 0));
      const left = v.lastMaintenanceKm + v.maintenanceIntervalKm - lastOdo;
      if (left <= 1000)
        out.push({
          kind: 'maintenanceDue',
          key: `maintenanceDue:${v.id}:${v.lastMaintenanceKm}`,
          tone: left <= 0 ? 'loss' : 'warn',
          params: { vehicle: v.name, km: Math.max(0, Math.round(left)) },
        });
    }
    if (on('documentExpiry'))
      for (const [field, date] of [['insurance', v.insuranceExpiry], ['documents', v.documentsExpiry]] as const)
        if (date && date <= addDays(today, 30))
          out.push({ kind: 'documentExpiry', key: `documentExpiry:${v.id}:${field}:${date}`, tone: date < today ? 'loss' : 'warn', params: { vehicle: v.name, doc: field, date } });
  }
  return out;
}

/** Weekly (previous Monday–Sunday) and monthly (previous month) summaries, when there was activity. */
export function computeSummaries(profile: Profile, ds: DataSet, today: ISODate): Alert[] {
  const out: Alert[] = [];
  const summary = (kind: 'weeklySummary' | 'monthlySummary', from: ISODate, to: ISODate, prevFrom: ISODate, prevTo: ISODate, goal: number | null) => {
    const p = computePeriod(ds, from, to);
    if (!p.workedDays) return;
    const prev = computePeriod(ds, prevFrom, prevTo);
    const params: Record<string, string | number> = {
      from, to, profit: p.profit, revenue: p.grossRevenue, days: p.workedDays, hours: Math.round(p.hours * 10) / 10,
    };
    if (p.profitPerHour != null) params.perHour = p.profitPerHour;
    if (prev.workedDays && prev.profit > 0) params.deltaPct = Math.round(((p.profit - prev.profit) / prev.profit) * 100);
    if (goal) params.goalPct = Math.round((p.profit / goal) * 100);
    out.push({ kind, key: `${kind}:${from}`, tone: p.profit >= 0 ? 'gain' : 'loss', params });
  };
  const ws = weekStart(today);
  summary('weeklySummary', addDays(ws, -7), addDays(ws, -1), addDays(ws, -14), addDays(ws, -8), null);
  const pm = addMonths(monthStart(today), -1);
  const ppm = addMonths(pm, -1);
  summary('monthlySummary', pm, monthEnd(pm), ppm, monthEnd(ppm), profile.monthlyGoal);
  return out;
}

export const monthRange = (today: ISODate) => ({ from: monthStart(today), to: today });
