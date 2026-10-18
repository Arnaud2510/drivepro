import type { ISODate, Minor, Vehicle } from '../domain/types';
import { compareVehicles, computePeriod, type DataSet, type PeriodResult } from './finance/engine';
import { currencyDigits } from './money';

export interface DriverData {
  userId: string;
  name: string;
  dataset: DataSet;
}

export interface DriverRow {
  userId: string;
  name: string;
  currency: string;
  period: PeriodResult;
  lastActivity: ISODate | null;
  /** Included in the consolidated totals (same currency as the fleet). */
  aggregated: boolean;
}

export interface FleetVehicleRow {
  vehicleId: string;
  vehicleName: string;
  driverName: string;
  days: number;
  km: number;
  grossRevenue: Minor;
  profit: Minor;
  profitPerKm: number | null;
  profitPerHour: number | null;
}

export interface FleetResult {
  currency: string;
  drivers: DriverRow[];
  /** Drivers whose currency differs: shown separately, never converted. */
  otherCurrencies: string[];
  totals: {
    activeDrivers: number;
    workedDays: number;
    grossRevenue: Minor;
    commissions: Minor;
    costs: Minor;
    profit: Minor;
    hours: number;
    km: number;
    profitPerHour: number | null;
    profitPerKm: number | null;
    marginPct: number | null;
    daysWithEstimates: number;
  };
  vehicles: FleetVehicleRow[];
}

/**
 * Consolidates the activity of consenting drivers. Each driver is computed with their own
 * settings (fixed-cost method, energy mode); amounts are summed only for drivers using the
 * fleet currency — no automatic conversion.
 */
export function computeFleet(drivers: DriverData[], from: ISODate, to: ISODate, asOf: ISODate, currency: string): FleetResult {
  const rows: DriverRow[] = drivers.map((d) => {
    const period = computePeriod(d.dataset, from, to, asOf < to ? asOf : to);
    const dates = d.dataset.days.map((x) => x.date).sort();
    return {
      userId: d.userId,
      name: d.name,
      currency: d.dataset.profile.currency,
      period,
      lastActivity: dates.length ? dates[dates.length - 1] : null,
      aggregated: d.dataset.profile.currency === currency,
    };
  });
  const agg = rows.filter((r) => r.aggregated);
  const sum = (f: (p: PeriodResult) => number) => agg.reduce((a, r) => a + f(r.period), 0);
  const dd = 10 ** currencyDigits(currency);
  const grossRevenue = sum((p) => p.grossRevenue);
  const profit = sum((p) => p.profit);
  const hours = sum((p) => p.hours);
  const km = sum((p) => p.km);
  // Ratios on the days where the denominator is known, as in computePeriod.
  const profitWithHours = agg.reduce((a, r) => a + r.period.days.filter((x) => x.hours).reduce((b, x) => b + x.profit, 0), 0);
  const profitWithKm = agg.reduce((a, r) => a + r.period.days.filter((x) => x.businessKm).reduce((b, x) => b + x.profit, 0), 0);

  const vehicles: FleetVehicleRow[] = [];
  for (const d of drivers) {
    if (d.dataset.profile.currency !== currency) continue;
    const period = rows.find((r) => r.userId === d.userId)!.period;
    const byId = new Map<string, Vehicle>(d.dataset.vehicles.map((v) => [v.id, v]));
    for (const v of compareVehicles(period.days, currency)) {
      if (v.key === 'none') continue;
      vehicles.push({
        vehicleId: v.key,
        vehicleName: byId.get(v.key)?.name ?? '—',
        driverName: d.name,
        days: v.days,
        km: v.km,
        grossRevenue: v.grossRevenue,
        profit: v.profit,
        profitPerKm: v.profitPerKm,
        profitPerHour: v.profitPerHour,
      });
    }
  }

  return {
    currency,
    drivers: rows,
    otherCurrencies: [...new Set(rows.filter((r) => !r.aggregated).map((r) => r.currency))],
    totals: {
      activeDrivers: agg.filter((r) => r.period.workedDays > 0).length,
      workedDays: sum((p) => p.workedDays),
      grossRevenue,
      commissions: sum((p) => p.commissions + p.platformFees),
      costs: sum((p) => p.totalCostsExclCommission),
      profit,
      hours,
      km,
      profitPerHour: hours > 0 ? profitWithHours / dd / hours : null,
      profitPerKm: km > 0 ? profitWithKm / dd / km : null,
      marginPct: grossRevenue > 0 ? (profit / grossRevenue) * 100 : null,
      daysWithEstimates: sum((p) => p.daysWithEstimates),
    },
    vehicles: vehicles.sort((a, b) => (b.profitPerKm ?? -Infinity) - (a.profitPerKm ?? -Infinity)),
  };
}
