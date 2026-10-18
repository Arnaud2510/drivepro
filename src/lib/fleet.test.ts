import { describe, expect, it } from 'vitest';
import type { Profile, Vehicle, WorkDay } from '../domain/types';
import type { DataSet } from './finance/engine';
import { computeFleet } from './fleet';
import { computeAlerts, computeSummaries } from './alerts';
import { defaultProfile } from '../data/defaults';

const vehicle = (id: string, name: string): Vehicle => ({
  id, name, make: '', model: '', year: null, type: 'car', fuelType: 'diesel', consumption: 6, energyPrice: 1.7, tankCapacity: null,
  odometer: null, purchasePrice: null, financing: 'owned', maintenanceIntervalKm: null, lastMaintenanceKm: null,
  insuranceExpiry: null, documentsExpiry: null, notes: '', archived: false,
});
const day = (date: string, vehicleId: string, gross: number, o: Partial<WorkDay> = {}): WorkDay => ({
  id: `${vehicleId}-${date}`, date, startTime: '08:00', endTime: '18:00', breakMinutes: 0, hoursOverride: null, vehicleId,
  odoStart: 0, odoEnd: 100, distanceKm: null, personalKm: 0, trips: null, deliveries: null, energyMode: 'estimated', notes: '',
  earnings: [{ id: `e-${vehicleId}-${date}`, platformId: null, label: '', grossKnown: true, gross, commission: 0, otherFees: 0, bonus: 0, bonusIncluded: true, tips: 0, tipsIncluded: true, netPaid: null, payoutStatus: 'received' }],
  ...o,
});
const profile = (currency = 'EUR'): Profile => ({ ...defaultProfile('x', 'FR'), currency, onboarded: true });
const ds = (p: Profile, vehicles: Vehicle[], days: WorkDay[]): DataSet => ({ profile: p, vehicles, platforms: [], days, expenses: [], fixedCosts: [] });

describe('fleet consolidation', () => {
  const a = { userId: 'a', name: 'Awa', dataset: ds(profile(), [vehicle('va', 'Corolla')], [day('2026-10-01', 'va', 20000), day('2026-10-02', 'va', 10000)]) };
  const b = { userId: 'b', name: 'Bruno', dataset: ds(profile(), [vehicle('vb', 'Prius')], [day('2026-10-01', 'vb', 8000)]) };
  const c = { userId: 'c', name: 'Coumba', dataset: ds(profile('XOF'), [vehicle('vc', 'Moto')], [day('2026-10-01', 'vc', 30000)]) };
  const f = computeFleet([a, b, c], '2026-10-01', '2026-10-31', '2026-10-15', 'EUR');

  it('sums drivers in the fleet currency only, never converting', () => {
    // fuel: 100 km × 6 L/100 × 1.70 = 10.20 € per day
    expect(f.totals.grossRevenue).toBe(38000);
    expect(f.totals.profit).toBe(38000 - 3 * 1020);
    expect(f.totals.workedDays).toBe(3);
    expect(f.totals.activeDrivers).toBe(2);
    expect(f.otherCurrencies).toEqual(['XOF']);
    expect(f.drivers.find((d) => d.userId === 'c')!.aggregated).toBe(false);
    expect(f.drivers.find((d) => d.userId === 'c')!.period.grossRevenue).toBe(30000);
  });

  it('computes fleet ratios over known hours and km', () => {
    expect(f.totals.hours).toBe(30);
    expect(f.totals.km).toBe(300);
    expect(f.totals.profitPerHour).toBeCloseTo((38000 - 3060) / 100 / 30, 10);
    expect(f.totals.profitPerKm).toBeCloseTo((38000 - 3060) / 100 / 300, 10);
  });

  it('ranks vehicles by profit per km and tracks last activity', () => {
    expect(f.vehicles.map((v) => v.vehicleName)).toEqual(['Corolla', 'Prius']);
    expect(f.vehicles.some((v) => v.vehicleName === 'Moto')).toBe(false);
    expect(f.drivers.find((d) => d.userId === 'a')!.lastActivity).toBe('2026-10-02');
  });

  it('handles a fleet without data', () => {
    const empty = computeFleet([], '2026-10-01', '2026-10-31', '2026-10-15', 'EUR');
    expect(empty.totals.profitPerHour).toBeNull();
    expect(empty.totals.marginPct).toBeNull();
  });
});

describe('notifications', () => {
  const p = { ...profile(), monthlyGoal: 50000 };
  const days = [day('2026-09-29', 'va', 20000), day('2026-10-06', 'va', 12000), day('2026-10-07', 'va', 9000)];
  const set = ds(p, [vehicle('va', 'Corolla')], days);

  it('summarises the previous week and month with stable keys', () => {
    const s = computeSummaries(p, set, '2026-10-14'); // Wednesday; previous week = Oct 5–11
    const weekly = s.find((x) => x.kind === 'weeklySummary')!;
    expect(weekly.key).toBe('weeklySummary:2026-10-05');
    expect(weekly.params).toMatchObject({ from: '2026-10-05', to: '2026-10-11', days: 2, revenue: 21000, profit: 21000 - 2040 });
    expect(weekly.params.deltaPct).toBe(Math.round(((21000 - 2040 - (20000 - 1020)) / (20000 - 1020)) * 100));
    const monthly = s.find((x) => x.kind === 'monthlySummary')!;
    expect(monthly.key).toBe('monthlySummary:2026-09-01');
    expect(monthly.params.goalPct).toBe(Math.round(((20000 - 1020) / 50000) * 100));
  });

  it('skips summaries when there was no activity', () => {
    expect(computeSummaries(p, ds(p, [], []), '2026-10-14')).toEqual([]);
  });

  it('marks the entry reminder as transient and keys alerts for dedupe', () => {
    const v = { ...vehicle('va', 'Corolla'), insuranceExpiry: '2026-10-20' };
    const alerts = computeAlerts(p, { profile: p, vehicles: [v], platforms: [], days, expenses: [], fixedCosts: [] }, [], '2026-10-14', null);
    expect(alerts.find((a) => a.kind === 'dailyReminder')).toMatchObject({ transient: true, key: 'dailyReminder:2026-10-14' });
    expect(alerts.find((a) => a.kind === 'documentExpiry')!.key).toBe('documentExpiry:va:insurance:2026-10-20');
  });

  it('respects disabled preferences', () => {
    const off = { ...p, notificationPrefs: { ...p.notificationPrefs, dailyReminder: false } };
    expect(computeAlerts(off, { profile: off, vehicles: [], platforms: [], days: [], expenses: [], fixedCosts: [] }, [], '2026-10-14', null)).toEqual([]);
  });
});
