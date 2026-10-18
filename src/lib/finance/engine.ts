/**
 * DrivePro financial engine — pure, side-effect free, unit tested.
 * See docs/FINANCE.md for the rules. Key principles:
 *  - every amount is an integer in minor units; rounding happens once per computed cost;
 *  - a real value always wins over an estimate, and each estimate is flagged;
 *  - nothing is deducted twice (commission, energy, fixed costs, tips, bonus).
 */
import {
  isEnergyCategory,
  type Earning,
  type Expense,
  type FixedCost,
  type FixedCostMethod,
  type ISODate,
  type Minor,
  type Profile,
  type UserPlatform,
  type Vehicle,
  type WorkDay,
} from '../../domain/types';
import { roundHalfAway, currencyDigits } from '../money';
import { daysInMonth, eachDay, minutesOf, monthEnd, monthStart, parseISO } from '../dates';

export type CommissionSource = 'actual' | 'derived' | 'estimated' | 'unknown' | 'included';

export interface EarningResult {
  earningId: string;
  platformId: string | null;
  /** Revenue counted in gross turnover (fares + bonus + tips, each counted once). */
  revenue: Minor;
  commission: Minor;
  commissionSource: CommissionSource;
  otherFees: Minor;
  afterCommissions: Minor;
  grossUnknown: boolean;
  issues: string[];
}

export type Issue =
  | 'odometerInverted'
  | 'noDistance'
  | 'noHours'
  | 'noRevenue'
  | 'energyEstimateMissing'
  | 'commissionUnknown'
  | 'commissionEstimated'
  | 'grossUnknown'
  | 'netPaidMismatch'
  | 'energyExpensesIgnored'
  | 'payoutNotReceived';

export interface DayResult {
  date: ISODate;
  dayId: string;
  vehicleId: string | null;
  earnings: EarningResult[];
  grossRevenue: Minor;
  commissions: Minor;
  platformFees: Minor;
  afterCommissions: Minor;
  totalKm: number | null;
  businessKm: number | null;
  hours: number | null;
  energy: { cost: Minor; source: 'estimated' | 'actual' | 'missing'; quantity: number | null; unit: 'L' | 'kWh' | null };
  /** Energy purchases of the day not deducted because the estimate is used (avoids double deduction). */
  ignoredEnergyExpenses: Minor;
  variableExpenses: Minor;
  fixedShare: Minor;
  /** Energy + variable expenses + fixed share (commission excluded). */
  costsExclCommission: Minor;
  /** Costs including commissions and platform fees. */
  totalCosts: Minor;
  profit: Minor;
  profitPerHour: number | null; // major units
  profitPerKm: number | null;
  revenuePerKm: number | null;
  costPerKm: number | null;
  marginPct: number | null;
  hasEstimates: boolean;
  issues: Issue[];
}

export interface DayContext {
  vehicle?: Vehicle | null;
  platforms: UserPlatform[];
  /** Expenses dated on this day (all categories). */
  expenses: Expense[];
  fixedShare: Minor;
  currency: string;
  /** Overrides the vehicle's energy price for this day (major units). */
  energyPriceOverride?: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const nz = (x: number | null | undefined) => x ?? 0;

export function computeEarning(e: Earning, platform: UserPlatform | undefined): EarningResult {
  const issues: string[] = [];
  const extras = (e.bonusIncluded ? 0 : nz(e.bonus)) + (e.tipsIncluded ? 0 : nz(e.tips));
  const otherFees = nz(e.otherFees);

  if (!e.grossKnown) {
    // Only the payout is known: commissions are already deducted from it.
    const net = nz(e.netPaid);
    return {
      earningId: e.id,
      platformId: e.platformId,
      revenue: net,
      commission: 0,
      commissionSource: 'included',
      otherFees: 0,
      afterCommissions: net,
      grossUnknown: true,
      issues: ['grossUnknown'],
    };
  }

  const fares = nz(e.gross);
  const revenue = fares + extras;
  let commission = 0;
  let commissionSource: CommissionSource;
  if (e.commission !== null && e.commission !== undefined) {
    commission = e.commission;
    commissionSource = 'actual';
  } else if (e.netPaid !== null && e.netPaid !== undefined) {
    commission = revenue - otherFees - e.netPaid;
    commissionSource = 'derived';
    if (commission < 0) issues.push('netPaidMismatch');
  } else if (platform?.commissionPct != null && e.platformId) {
    commission = roundHalfAway((fares * platform.commissionPct) / 100);
    commissionSource = 'estimated';
    issues.push('commissionEstimated');
  } else {
    commissionSource = e.platformId ? 'unknown' : 'actual';
    if (e.platformId) issues.push('commissionUnknown');
  }
  const afterCommissions = revenue - commission - otherFees;
  if (e.commission != null && e.netPaid != null && afterCommissions !== e.netPaid) issues.push('netPaidMismatch');

  return {
    earningId: e.id,
    platformId: e.platformId,
    revenue,
    commission,
    commissionSource,
    otherFees,
    afterCommissions,
    grossUnknown: false,
    issues,
  };
}

export function dayDistance(day: WorkDay): { total: number | null; business: number | null; inverted: boolean } {
  let total: number | null = null;
  let inverted = false;
  if (day.odoStart != null && day.odoEnd != null) {
    if (day.odoEnd < day.odoStart) inverted = true;
    else total = day.odoEnd - day.odoStart;
  }
  if (total === null && day.distanceKm != null) total = day.distanceKm;
  const business = total === null ? null : Math.max(0, total - nz(day.personalKm));
  return { total, business, inverted };
}

export function dayHours(day: WorkDay): number | null {
  if (day.hoursOverride != null) return day.hoursOverride > 0 ? day.hoursOverride : null;
  const s = minutesOf(day.startTime);
  const e = minutesOf(day.endTime);
  if (s === null || e === null) return null;
  let span = e - s;
  if (span <= 0) span += 24 * 60; // shift crossing midnight
  const active = span - nz(day.breakMinutes);
  return active > 0 ? active / 60 : null;
}

export function estimateEnergy(
  km: number,
  vehicle: Vehicle | null | undefined,
  currency: string,
  priceOverride?: number | null,
): { cost: Minor; quantity: number; unit: 'L' | 'kWh' } | null {
  const price = priceOverride ?? vehicle?.energyPrice;
  if (!vehicle || vehicle.consumption == null || price == null) return null;
  const quantity = (km * vehicle.consumption) / 100;
  const cost = roundHalfAway(quantity * price * 10 ** currencyDigits(currency));
  return { cost, quantity, unit: vehicle.fuelType === 'electric' ? 'kWh' : 'L' };
}

export function computeDay(day: WorkDay, ctx: DayContext): DayResult {
  const issues = new Set<Issue>();
  const byId = new Map(ctx.platforms.map((p) => [p.id, p]));
  const earnings = day.earnings.map((e) => computeEarning(e, e.platformId ? byId.get(e.platformId) : undefined));
  earnings.forEach((r) => r.issues.forEach((i) => issues.add(i as Issue)));
  if (day.earnings.some((e) => e.payoutStatus !== 'received')) issues.add('payoutNotReceived');

  const grossRevenue = sum(earnings.map((r) => r.revenue));
  const commissions = sum(earnings.map((r) => r.commission));
  const platformFees = sum(earnings.map((r) => r.otherFees));
  const afterCommissions = grossRevenue - commissions - platformFees;

  const dist = dayDistance(day);
  if (dist.inverted) issues.add('odometerInverted');
  // Distance only matters when fuel is estimated from kilometres.
  if (dist.business === null && day.energyMode === 'estimated') issues.add('noDistance');
  const hours = dayHours(day);
  if (hours === null) issues.add('noHours');
  if (day.earnings.length === 0) issues.add('noRevenue');

  const energyExpenses = ctx.expenses.filter((x) => isEnergyCategory(x.category));
  const energyPaid = sum(energyExpenses.map((x) => x.amount));
  let energy: DayResult['energy'];
  let ignoredEnergyExpenses = 0;
  if (day.energyMode === 'estimated') {
    const est = dist.business != null ? estimateEnergy(dist.business, ctx.vehicle, ctx.currency, ctx.energyPriceOverride) : null;
    if (est) energy = { cost: est.cost, source: 'estimated', quantity: est.quantity, unit: est.unit };
    else {
      energy = { cost: 0, source: 'missing', quantity: null, unit: null };
      if (dist.business) issues.add('energyEstimateMissing');
    }
    ignoredEnergyExpenses = energyPaid;
    if (energyPaid > 0) issues.add('energyExpensesIgnored');
  } else {
    energy = { cost: energyPaid, source: 'actual', quantity: null, unit: null };
  }

  const variableExpenses = sum(ctx.expenses.filter((x) => !isEnergyCategory(x.category)).map((x) => x.amount));
  const costsExclCommission = energy.cost + variableExpenses + ctx.fixedShare;
  const totalCosts = costsExclCommission + commissions + platformFees;
  const profit = grossRevenue - totalCosts;

  const d = 10 ** currencyDigits(ctx.currency);
  const km = dist.business;
  return {
    date: day.date,
    dayId: day.id,
    vehicleId: day.vehicleId,
    earnings,
    grossRevenue,
    commissions,
    platformFees,
    afterCommissions,
    totalKm: dist.total,
    businessKm: km,
    hours,
    energy,
    ignoredEnergyExpenses,
    variableExpenses,
    fixedShare: ctx.fixedShare,
    costsExclCommission,
    totalCosts,
    profit,
    profitPerHour: hours ? profit / d / hours : null,
    profitPerKm: km ? profit / d / km : null,
    revenuePerKm: km ? grossRevenue / d / km : null,
    costPerKm: km ? totalCosts / d / km : null,
    marginPct: grossRevenue > 0 ? (profit / grossRevenue) * 100 : null,
    hasEstimates:
      energy.source === 'estimated' ||
      earnings.some((r) => r.commissionSource === 'estimated' || r.grossUnknown) ||
      day.earnings.some((e) => e.payoutStatus === 'estimated'),
    issues: [...issues],
  };
}

/* ------------------------------------------------------------------ */
/* Fixed costs                                                          */
/* ------------------------------------------------------------------ */

export function activeFixedCosts(costs: FixedCost[], date: ISODate): FixedCost[] {
  return costs.filter((c) => c.startDate <= date && (!c.endDate || c.endDate >= date));
}

/** Share of fixed costs charged to one worked day, according to the chosen method. */
export function fixedShareForDay(
  costs: FixedCost[],
  date: ISODate,
  method: FixedCostMethod,
  plannedWorkDays: number,
): Minor {
  const monthly = sum(activeFixedCosts(costs, date).map((c) => c.monthlyAmount));
  if (!monthly || method === 'separate') return 0;
  if (method === 'worked_day') return roundHalfAway(monthly / Math.max(1, plannedWorkDays));
  const { y, m } = parseISO(date);
  return roundHalfAway(monthly / daysInMonth(y, m));
}

/** Fixed costs attributable to a period of calendar days (pro rata of each month). */
export function fixedCostsForCalendarDays(costs: FixedCost[], from: ISODate, to: ISODate): Minor {
  if (to < from) return 0;
  let total = 0;
  for (const d of eachDay(from, to)) {
    const { y, m } = parseISO(d);
    total += sum(activeFixedCosts(costs, d).map((c) => c.monthlyAmount)) / daysInMonth(y, m);
  }
  return roundHalfAway(total);
}

/* ------------------------------------------------------------------ */
/* Periods                                                              */
/* ------------------------------------------------------------------ */

export interface DataSet {
  profile: Pick<Profile, 'currency' | 'fixedCostMethod' | 'plannedWorkDays' | 'defaultEnergyMode' | 'taxProvisionPct'>;
  vehicles: Vehicle[];
  platforms: UserPlatform[];
  days: WorkDay[];
  expenses: Expense[];
  fixedCosts: FixedCost[];
}

export function computeAllDays(ds: DataSet): DayResult[] {
  const vehicles = new Map(ds.vehicles.map((v) => [v.id, v]));
  const expensesByDate = groupBy(ds.expenses, (e) => e.date);
  return [...ds.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) =>
      computeDay(day, {
        vehicle: day.vehicleId ? vehicles.get(day.vehicleId) : null,
        platforms: ds.platforms,
        expenses: expensesByDate.get(day.date) ?? [],
        fixedShare: fixedShareForDay(ds.fixedCosts, day.date, ds.profile.fixedCostMethod, ds.profile.plannedWorkDays),
        currency: ds.profile.currency,
      }),
    );
}

export interface PeriodResult {
  from: ISODate;
  to: ISODate;
  days: DayResult[];
  workedDays: number;
  grossRevenue: Minor;
  commissions: Minor;
  platformFees: Minor;
  energy: Minor;
  variableExpenses: Minor;
  /** Expenses dated on days without a work entry (still part of the activity cost). */
  offDayExpenses: Minor;
  ignoredEnergyExpenses: Minor;
  fixedCosts: Minor;
  totalCostsExclCommission: Minor;
  profit: Minor;
  hours: number;
  km: number;
  profitPerHour: number | null;
  profitPerKm: number | null;
  costPerKm: number | null;
  revenuePerKm: number | null;
  marginPct: number | null;
  avgProfitPerWorkedDay: Minor | null;
  daysWithEstimates: number;
  daysWithIssues: number;
  expensesByCategory: Record<string, Minor>;
}

/**
 * Aggregates a period. `asOf` caps calendar-day allocation of fixed costs for a period
 * still in progress (e.g. the current month is charged only up to today).
 */
export function computePeriod(ds: DataSet, from: ISODate, to: ISODate, asOf: ISODate = to): PeriodResult {
  const all = computeAllDays(ds).filter((d) => d.date >= from && d.date <= to);
  const workedDates = new Set(all.map((d) => d.date));
  const daysByDate = new Map(ds.days.map((d) => [d.date, d]));
  const { fixedCostMethod: method } = ds.profile;

  let offDayExpenses = 0;
  let ignoredEnergyExpenses = sum(all.map((d) => d.ignoredEnergyExpenses));
  const expensesByCategory: Record<string, Minor> = {};
  for (const x of ds.expenses) {
    if (x.date < from || x.date > to) continue;
    const day = daysByDate.get(x.date);
    const energy = isEnergyCategory(x.category);
    if (!workedDates.has(x.date)) {
      // Energy bought on a non-worked day: deducted only when the user works from real purchases.
      if (energy && ds.profile.defaultEnergyMode === 'estimated') {
        ignoredEnergyExpenses += x.amount;
        continue;
      }
      offDayExpenses += x.amount;
    } else if (energy && day?.energyMode === 'estimated') continue;
    expensesByCategory[x.category] = (expensesByCategory[x.category] ?? 0) + x.amount;
  }
  const estimatedEnergy = sum(all.filter((d) => d.energy.source === 'estimated').map((d) => d.energy.cost));
  if (estimatedEnergy) expensesByCategory.fuelEstimated = estimatedEnergy;

  let fixedCosts: Minor;
  if (method === 'worked_day') fixedCosts = sum(all.map((d) => d.fixedShare));
  else {
    const end = asOf < to ? asOf : to;
    fixedCosts = fixedCostsForCalendarDays(ds.fixedCosts, from, end);
  }
  if (fixedCosts) expensesByCategory.fixedCosts = fixedCosts;

  const grossRevenue = sum(all.map((d) => d.grossRevenue));
  const commissions = sum(all.map((d) => d.commissions));
  const platformFees = sum(all.map((d) => d.platformFees));
  const energy = sum(all.map((d) => d.energy.cost));
  const variableExpenses = sum(all.map((d) => d.variableExpenses));
  const totalCostsExclCommission = energy + variableExpenses + offDayExpenses + fixedCosts;
  const profit = grossRevenue - commissions - platformFees - totalCostsExclCommission;
  const hours = sum(all.map((d) => d.hours ?? 0));
  const km = sum(all.map((d) => d.businessKm ?? 0));
  const dd = 10 ** currencyDigits(ds.profile.currency);
  // Hourly / per-km ratios use only days where the denominator is known, to stay consistent.
  const profitWithHours = sum(all.filter((d) => d.hours).map((d) => d.profit));
  const profitWithKm = sum(all.filter((d) => d.businessKm).map((d) => d.profit));

  return {
    from,
    to,
    days: all,
    workedDays: all.length,
    grossRevenue,
    commissions,
    platformFees,
    energy,
    variableExpenses,
    offDayExpenses,
    ignoredEnergyExpenses,
    fixedCosts,
    totalCostsExclCommission,
    profit,
    hours,
    km,
    profitPerHour: hours > 0 ? profitWithHours / dd / hours : null,
    profitPerKm: km > 0 ? profitWithKm / dd / km : null,
    costPerKm: km > 0 ? sum(all.filter((d) => d.businessKm).map((d) => d.totalCosts)) / dd / km : null,
    revenuePerKm: km > 0 ? sum(all.filter((d) => d.businessKm).map((d) => d.grossRevenue)) / dd / km : null,
    marginPct: grossRevenue > 0 ? (profit / grossRevenue) * 100 : null,
    avgProfitPerWorkedDay: all.length ? roundHalfAway(profit / all.length) : null,
    daysWithEstimates: all.filter((d) => d.hasEstimates).length,
    daysWithIssues: all.filter((d) => d.issues.some((i) => !['payoutNotReceived', 'commissionEstimated'].includes(i))).length,
    expensesByCategory,
  };
}

/* ------------------------------------------------------------------ */
/* Projection                                                           */
/* ------------------------------------------------------------------ */

export interface MonthProjection {
  method: 'pace' | 'planned';
  actualProfit: Minor;
  workedDays: number;
  elapsedDays: number;
  remainingDays: number;
  expectedRemainingWorkDays: number;
  projectedProfit: Minor | null;
  goal: Minor | null;
  gapToGoal: Minor | null;
}

/**
 * End-of-month projection. Operating profit before fixed costs is extrapolated from the
 * average per worked day, then the full month of fixed costs is deducted. It is a projection,
 * never a guaranteed income.
 */
export function projectMonth(ds: DataSet, today: ISODate, method: 'pace' | 'planned', goal: Minor | null): MonthProjection {
  const from = monthStart(today);
  const to = monthEnd(today);
  const p = computePeriod(ds, from, to, today);
  const { d: dayOfMonth } = parseISO(today);
  const totalDays = parseISO(to).d;
  const elapsedDays = dayOfMonth;
  const remainingDays = totalDays - dayOfMonth;
  const expectedRemainingWorkDays =
    method === 'pace'
      ? (p.workedDays / elapsedDays) * remainingDays
      : Math.max(0, ds.profile.plannedWorkDays - p.workedDays);

  let projectedProfit: Minor | null = null;
  if (p.workedDays > 0) {
    const beforeFixed = p.profit + p.fixedCosts;
    const perDay = beforeFixed / p.workedDays;
    const projectedWorked = p.workedDays + expectedRemainingWorkDays;
    const fullFixed =
      ds.profile.fixedCostMethod === 'worked_day'
        ? sum(activeFixedCosts(ds.fixedCosts, today).map((c) => c.monthlyAmount)) *
          Math.min(1, projectedWorked / Math.max(1, ds.profile.plannedWorkDays))
        : fixedCostsForCalendarDays(ds.fixedCosts, from, to);
    projectedProfit = roundHalfAway(beforeFixed + perDay * expectedRemainingWorkDays - fullFixed);
  }
  return {
    method,
    actualProfit: p.profit,
    workedDays: p.workedDays,
    elapsedDays,
    remainingDays,
    expectedRemainingWorkDays,
    projectedProfit,
    goal,
    gapToGoal: goal != null && projectedProfit != null ? projectedProfit - goal : null,
  };
}

/* ------------------------------------------------------------------ */
/* Tax provision                                                        */
/* ------------------------------------------------------------------ */

export function taxProvision(profit: Minor, ratePct: number | null) {
  if (ratePct == null || ratePct <= 0) return { beforeTax: profit, provision: 0, afterProvision: profit, configured: false };
  const provision = profit > 0 ? roundHalfAway((profit * ratePct) / 100) : 0;
  return { beforeTax: profit, provision, afterProvision: profit - provision, configured: true };
}

/* ------------------------------------------------------------------ */
/* Comparisons                                                          */
/* ------------------------------------------------------------------ */

export interface CompareRow {
  key: string;
  days: number;
  grossRevenue: Minor;
  commissions: Minor;
  costs: Minor; // allocated energy + variable + fixed share
  profit: Minor;
  hours: number;
  km: number;
  profitPerHour: number | null;
  profitPerKm: number | null;
  prorated: boolean;
  sufficient: boolean;
}

export const MIN_COMPARE_DAYS = 3;
export const MIN_COMPARE_HOURS = 5;

/**
 * Per-platform comparison. When a day mixes several platforms, its hours, km and costs are
 * allocated pro rata of each platform's revenue (flagged `prorated`): a known limitation.
 */
export function comparePlatforms(results: DayResult[], currency: string): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  const dd = 10 ** currencyDigits(currency);
  for (const day of results) {
    const multi = new Set(day.earnings.map((e) => e.platformId ?? 'direct')).size > 1;
    for (const e of day.earnings) {
      const key = e.platformId ?? 'direct';
      const share = day.grossRevenue > 0 ? e.revenue / day.grossRevenue : 1 / day.earnings.length;
      const row = rows.get(key) ?? blankRow(key);
      row.grossRevenue += e.revenue;
      row.commissions += e.commission + e.otherFees;
      row.costs += day.costsExclCommission * share;
      row.hours += (day.hours ?? 0) * share;
      row.km += (day.businessKm ?? 0) * share;
      row.days += share;
      row.prorated ||= multi;
      rows.set(key, row);
    }
  }
  return finishRows(rows, dd);
}

export function compareVehicles(results: DayResult[], currency: string): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  for (const day of results) {
    const key = day.vehicleId ?? 'none';
    const row = rows.get(key) ?? blankRow(key);
    row.grossRevenue += day.grossRevenue;
    row.commissions += day.commissions + day.platformFees;
    row.costs += day.costsExclCommission;
    row.hours += day.hours ?? 0;
    row.km += day.businessKm ?? 0;
    row.days += 1;
    rows.set(key, row);
  }
  return finishRows(rows, 10 ** currencyDigits(currency));
}

function blankRow(key: string): CompareRow {
  return { key, days: 0, grossRevenue: 0, commissions: 0, costs: 0, profit: 0, hours: 0, km: 0, profitPerHour: null, profitPerKm: null, prorated: false, sufficient: false };
}

function finishRows(rows: Map<string, CompareRow>, dd: number): CompareRow[] {
  return [...rows.values()].map((r) => {
    r.costs = roundHalfAway(r.costs);
    r.profit = r.grossRevenue - r.commissions - r.costs;
    r.profitPerHour = r.hours > 0 ? r.profit / dd / r.hours : null;
    r.profitPerKm = r.km > 0 ? r.profit / dd / r.km : null;
    r.sufficient = r.days >= MIN_COMPARE_DAYS && r.hours >= MIN_COMPARE_HOURS;
    return r;
  });
}

export function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}
