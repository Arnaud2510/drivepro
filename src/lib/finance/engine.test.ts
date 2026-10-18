import { describe, expect, it } from 'vitest';
import type { Earning, Expense, FixedCost, UserPlatform, Vehicle, WorkDay } from '../../domain/types';
import {
  compareVehicles,
  comparePlatforms,
  computeAllDays,
  computeDay,
  computePeriod,
  fixedShareForDay,
  projectMonth,
  taxProvision,
  type DataSet,
} from './engine';
import { convert, formatMoney, parseAmount, roundHalfAway, toMinor } from '../money';
import { dateInTimeZone } from '../dates';

const vehicle = (o: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1', name: 'Car', make: '', model: '', year: null, type: 'car', fuelType: 'diesel',
  consumption: 6, energyPrice: 1.7, tankCapacity: null, odometer: null, purchasePrice: null,
  financing: 'owned', maintenanceIntervalKm: null, lastMaintenanceKm: null, insuranceExpiry: null,
  documentsExpiry: null, notes: '', archived: false, ...o,
});
const earning = (o: Partial<Earning> = {}): Earning => ({
  id: Math.random().toString(36), platformId: 'uber', label: '', grossKnown: true, gross: 15000,
  commission: 3000, otherFees: 0, bonus: 0, bonusIncluded: true, tips: 0, tipsIncluded: true,
  netPaid: null, payoutStatus: 'received', ...o,
});
const day = (o: Partial<WorkDay> = {}): WorkDay => ({
  id: 'd1', date: '2026-10-15', startTime: '08:00', endTime: '19:00', breakMinutes: 60,
  hoursOverride: null, vehicleId: 'v1', odoStart: 10000, odoEnd: 10200, distanceKm: null,
  personalKm: 0, trips: 12, deliveries: null, energyMode: 'estimated', earnings: [earning()], notes: '', ...o,
});
const exp = (category: string, amount: number, o: Partial<Expense> = {}): Expense => ({
  id: Math.random().toString(36), date: '2026-10-15', category, amount, description: '',
  vehicleId: 'v1', paymentMethod: 'card', kind: 'daily', receiptPath: null, ...o,
});
const platforms: UserPlatform[] = [
  { id: 'uber', name: 'Uber', catalogId: 'uber', commissionPct: 25, notes: '', active: true },
  { id: 'bolt', name: 'Bolt', catalogId: 'bolt', commissionPct: 15, notes: '', active: true },
];
const scenarioExpenses = [exp('food', 1000), exp('cleaning', 500), exp('maintenance', 500)];

describe('reference scenario (section 23)', () => {
  const r = computeDay(day(), { vehicle: vehicle(), platforms, expenses: scenarioExpenses, fixedShare: 1000, currency: 'EUR' });

  it('reproduces every expected figure', () => {
    expect(r.grossRevenue).toBe(15000);
    expect(r.commissions).toBe(3000);
    expect(r.energy.quantity).toBeCloseTo(12, 10);
    expect(r.energy.cost).toBe(2040);
    expect(r.costsExclCommission).toBe(5040);
    expect(r.totalCosts).toBe(8040);
    expect(r.profit).toBe(6960);
    expect(r.hours).toBe(10);
    expect(r.profitPerHour).toBeCloseTo(6.96, 10);
    expect(r.profitPerKm).toBeCloseTo(0.348, 10);
    expect(r.marginPct).toBeCloseTo(46.4, 10);
    expect(r.businessKm).toBe(200);
  });

  it('flags the fuel as estimated', () => {
    expect(r.energy.source).toBe('estimated');
    expect(r.hasEstimates).toBe(true);
  });
});

describe('edge cases', () => {
  const ctx = { vehicle: vehicle(), platforms, expenses: [] as Expense[], fixedShare: 0, currency: 'EUR' };

  it('day without revenue: margin not computable, negative profit', () => {
    const r = computeDay(day({ earnings: [] }), ctx);
    expect(r.grossRevenue).toBe(0);
    expect(r.marginPct).toBeNull();
    expect(r.profit).toBe(-2040);
    expect(r.issues).toContain('noRevenue');
  });

  it('day without kilometres: per-km ratios are null, no fuel estimate', () => {
    const r = computeDay(day({ odoStart: null, odoEnd: null }), ctx);
    expect(r.businessKm).toBeNull();
    expect(r.profitPerKm).toBeNull();
    expect(r.energy.cost).toBe(0);
    expect(r.issues).toContain('noDistance');
  });

  it('day without hours: hourly ratio is null (insufficient data)', () => {
    const r = computeDay(day({ startTime: null, endTime: null }), ctx);
    expect(r.hours).toBeNull();
    expect(r.profitPerHour).toBeNull();
    expect(r.issues).toContain('noHours');
  });

  it('shift crossing midnight', () => {
    expect(computeDay(day({ startTime: '20:00', endTime: '04:00', breakMinutes: 30 }), ctx).hours).toBe(7.5);
  });

  it('negative profit', () => {
    const r = computeDay(day({ earnings: [earning({ gross: 2000, commission: 500 })] }), {
      ...ctx,
      expenses: [exp('repair', 30000)],
    });
    expect(r.profit).toBe(2000 - 500 - 2040 - 30000);
    expect(r.marginPct).toBeLessThan(0);
  });

  it('several platforms, bonus and tips counted once', () => {
    const r = computeDay(
      day({
        earnings: [
          earning({ platformId: 'uber', gross: 10000, commission: 2500, tips: 500, tipsIncluded: false }),
          earning({ platformId: 'bolt', gross: 5000, commission: 750, bonus: 1000, bonusIncluded: true }),
          earning({ platformId: null, gross: 3000, commission: null }),
        ],
      }),
      ctx,
    );
    expect(r.grossRevenue).toBe(10000 + 500 + 5000 + 3000);
    expect(r.commissions).toBe(3250);
  });

  it('estimated commission only when the real one is unknown', () => {
    const r = computeDay(day({ earnings: [earning({ commission: null })] }), ctx);
    expect(r.commissions).toBe(3750); // 25 % of 150 €
    expect(r.earnings[0].commissionSource).toBe('estimated');
    const r2 = computeDay(day({ earnings: [earning({ commission: 2000 })] }), ctx);
    expect(r2.commissions).toBe(2000);
  });

  it('commission derived from gross and net payout', () => {
    const r = computeDay(day({ earnings: [earning({ commission: null, netPaid: 11800, otherFees: 200 })] }), ctx);
    expect(r.commissions).toBe(3000);
    expect(r.earnings[0].commissionSource).toBe('derived');
    expect(r.afterCommissions).toBe(11800);
  });

  it('commission already deducted (only net known): not deducted again', () => {
    const r = computeDay(day({ earnings: [earning({ grossKnown: false, gross: null, commission: null, netPaid: 12000 })] }), ctx);
    expect(r.grossRevenue).toBe(12000);
    expect(r.commissions).toBe(0);
    expect(r.profit).toBe(12000 - 2040);
    expect(r.issues).toContain('grossUnknown');
  });

  it('actual fuel mode uses purchases and never the estimate', () => {
    const r = computeDay(day({ energyMode: 'actual' }), { ...ctx, expenses: [exp('fuel', 5000)] });
    expect(r.energy).toMatchObject({ cost: 5000, source: 'actual' });
    expect(r.profit).toBe(15000 - 3000 - 5000);
  });

  it('estimated fuel mode ignores fuel purchases to avoid double deduction', () => {
    const r = computeDay(day(), { ...ctx, expenses: [exp('fuel', 5000)] });
    expect(r.energy.cost).toBe(2040);
    expect(r.ignoredEnergyExpenses).toBe(5000);
    expect(r.profit).toBe(15000 - 3000 - 2040);
  });

  it('electric vehicle in kWh', () => {
    const r = computeDay(day(), { ...ctx, vehicle: vehicle({ fuelType: 'electric', consumption: 16, energyPrice: 0.25 }) });
    expect(r.energy).toMatchObject({ cost: 800, unit: 'kWh' });
    expect(r.energy.quantity).toBeCloseTo(32);
  });

  it('personal kilometres are excluded', () => {
    expect(computeDay(day({ personalKm: 20 }), ctx).businessKm).toBe(180);
  });

  it('inverted odometer is flagged, manual distance used as fallback', () => {
    const r = computeDay(day({ odoStart: 500, odoEnd: 100, distanceKm: 150 }), ctx);
    expect(r.issues).toContain('odometerInverted');
    expect(r.businessKm).toBe(150);
  });

  it('XOF has no decimals', () => {
    const r = computeDay(day({ earnings: [earning({ gross: 45000, commission: 9000 })] }), {
      ...ctx,
      currency: 'XOF',
      vehicle: vehicle({ consumption: 7, energyPrice: 875 }),
    });
    expect(r.energy.cost).toBe(12250); // 200 km × 7 L/100 × 875 XOF
    expect(r.profit).toBe(45000 - 9000 - 12250);
  });
});

describe('fixed costs, periods and projections', () => {
  const fixed: FixedCost[] = [
    { id: 'f1', label: 'Insurance', category: 'insurance', monthlyAmount: 31000, vehicleId: 'v1', startDate: '2026-01-01', endDate: null },
  ];
  const base: DataSet = {
    profile: { currency: 'EUR', fixedCostMethod: 'calendar_day', plannedWorkDays: 22, defaultEnergyMode: 'estimated', taxProvisionPct: null },
    vehicles: [vehicle()], platforms, fixedCosts: fixed, expenses: [],
    days: [day({ id: 'a', date: '2026-10-01' }), day({ id: 'b', date: '2026-10-02' })],
  };

  it('a monthly charge is never fully deducted on one day', () => {
    expect(fixedShareForDay(fixed, '2026-10-15', 'calendar_day', 22)).toBe(1000); // 310 € / 31 days
    expect(fixedShareForDay(fixed, '2026-10-15', 'worked_day', 22)).toBe(1409);
    expect(fixedShareForDay(fixed, '2026-10-15', 'separate', 22)).toBe(0);
    expect(fixedShareForDay(fixed, '2025-12-15', 'calendar_day', 22)).toBe(0); // not active yet
  });

  it('calendar allocation over a period stops at asOf', () => {
    const p = computePeriod(base, '2026-10-01', '2026-10-31', '2026-10-10');
    expect(p.fixedCosts).toBe(10000);
    const full = computePeriod(base, '2026-10-01', '2026-10-31');
    expect(full.fixedCosts).toBe(31000);
  });

  it('separate method: zero on days, full pro rata at period level', () => {
    const ds = { ...base, profile: { ...base.profile, fixedCostMethod: 'separate' as const } };
    expect(computeAllDays(ds)[0].fixedShare).toBe(0);
    expect(computePeriod(ds, '2026-10-01', '2026-10-31').fixedCosts).toBe(31000);
  });

  it('off-day expenses count, off-day fuel is ignored in estimated mode', () => {
    const ds = { ...base, expenses: [exp('parking', 500, { date: '2026-10-05' }), exp('fuel', 6000, { date: '2026-10-05' })] };
    const p = computePeriod(ds, '2026-10-01', '2026-10-31', '2026-10-01');
    expect(p.offDayExpenses).toBe(500);
    expect(p.ignoredEnergyExpenses).toBe(6000);
  });

  it('period totals', () => {
    const p = computePeriod(base, '2026-10-01', '2026-10-31', '2026-10-02');
    expect(p.workedDays).toBe(2);
    expect(p.grossRevenue).toBe(30000);
    expect(p.fixedCosts).toBe(2000);
    expect(p.profit).toBe(30000 - 6000 - 4080 - 2000);
    expect(p.hours).toBe(20);
  });

  it('pace projection deducts the full month of fixed costs', () => {
    const pr = projectMonth(base, '2026-10-02', 'pace', 200000);
    // 2 days worked out of 2 elapsed -> 29 more expected; 9960 before fixed per day
    expect(pr.expectedRemainingWorkDays).toBe(29);
    expect(pr.projectedProfit).toBe(9960 * 31 - 31000);
    expect(pr.gapToGoal).toBe(9960 * 31 - 31000 - 200000);
  });

  it('planned projection uses the planned working days', () => {
    const pr = projectMonth(base, '2026-10-02', 'planned', null);
    expect(pr.expectedRemainingWorkDays).toBe(20);
    expect(pr.projectedProfit).toBe(9960 * 22 - 31000);
  });

  it('no projection without data', () => {
    expect(projectMonth({ ...base, days: [] }, '2026-10-02', 'pace', null).projectedProfit).toBeNull();
  });

  it('vehicle and platform comparisons', () => {
    const ds: DataSet = {
      ...base,
      fixedCosts: [],
      vehicles: [vehicle(), vehicle({ id: 'v2', consumption: 3, fuelType: 'petrol', type: 'moto' })],
      days: [
        day({ id: 'a', date: '2026-10-01', earnings: [earning({ platformId: 'uber', gross: 10000, commission: 2500 }), earning({ platformId: 'bolt', gross: 10000, commission: 1500 })] }),
        day({ id: 'b', date: '2026-10-02', vehicleId: 'v2' }),
      ],
    };
    const res = computeAllDays(ds);
    const v = compareVehicles(res, 'EUR');
    expect(v.find((r) => r.key === 'v2')!.costs).toBe(1020);
    const p = comparePlatforms(res, 'EUR');
    const bolt = p.find((r) => r.key === 'bolt')!;
    expect(bolt.prorated).toBe(true);
    expect(bolt.hours).toBe(5);
    expect(bolt.costs).toBe(1020);
    expect(bolt.profit).toBe(10000 - 1500 - 1020);
    expect(bolt.sufficient).toBe(false);
  });
});

describe('money, currencies, time zones', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(toMinor(1.005, 'EUR')).toBe(101);
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
  });

  it('parses amounts typed in different locales', () => {
    expect(parseAmount('150', 'EUR')).toBe(15000);
    expect(parseAmount('20,40', 'EUR')).toBe(2040);
    expect(parseAmount('1 234,56 €', 'EUR')).toBe(123456);
    expect(parseAmount('1,234.56', 'EUR')).toBe(123456);
    expect(parseAmount('1.500', 'XOF')).toBe(1500);
    expect(parseAmount('25 000', 'XOF')).toBe(25000);
    expect(parseAmount('150 000', 'GNF')).toBe(150000);
    expect(parseAmount('abc', 'EUR')).toBeNull();
  });

  it('formats XOF, XAF and GNF without decimals', () => {
    expect(formatMoney(25000, 'XOF', 'fr-CI').replace(/\s/g, ' ')).toMatch(/25 000/);
    expect(formatMoney(6960, 'EUR', 'fr-FR').replace(/\s/g, ' ')).toBe('69,60 €');
  });

  it('converts only with a dated, sourced rate', () => {
    const r = convert(6960, { from: 'EUR', to: 'XOF', rate: 655.957, date: '1999-01-01', source: 'Fixed parity EUR/XOF' });
    expect(r.amount).toBe(45655);
    expect(() => convert(100, { from: 'EUR', to: 'XOF', rate: 655.957, date: '', source: '' })).toThrow();
  });

  it('tax provision is separate and only on positive profit', () => {
    expect(taxProvision(6960, 20)).toEqual({ beforeTax: 6960, provision: 1392, afterProvision: 5568, configured: true });
    expect(taxProvision(-500, 20).provision).toBe(0);
    expect(taxProvision(6960, null).configured).toBe(false);
  });

  it('assigns a work date in the driver time zone', () => {
    const instant = new Date('2026-10-15T23:30:00Z');
    expect(dateInTimeZone(instant, 'Africa/Abidjan')).toBe('2026-10-15');
    expect(dateInTimeZone(instant, 'Europe/Paris')).toBe('2026-10-16');
    expect(dateInTimeZone(instant, 'Europe/Lisbon')).toBe('2026-10-16');
  });

  it('incomplete data does not crash and is flagged', () => {
    const r = computeDay(day({ startTime: null, endTime: null, odoStart: null, odoEnd: null, vehicleId: null, earnings: [earning({ commission: null, platformId: 'x' })] }), {
      platforms: [], expenses: [], fixedShare: 0, currency: 'EUR',
    });
    expect(r.issues).toEqual(expect.arrayContaining(['noHours', 'noDistance', 'commissionUnknown']));
    expect(r.profit).toBe(15000);
  });
});
