import type { Earning, Expense, Lang, UserData, WorkDay } from '../domain/types';
import { addDays, todayIn } from '../lib/dates';
import { defaultProfile } from './defaults';

/**
 * Demonstration data set — stored in its own namespace, shown with a permanent "demo" banner,
 * never mixed with the user's own data. Figures are illustrative, not market data.
 */
export function buildDemoData(lang: string): UserData {
  const profile = {
    ...defaultProfile('demo', 'FR'),
    displayName: 'Demo',
    city: 'Lyon',
    language: (['fr', 'en', 'es', 'pt', 'de', 'it'].includes(lang.slice(0, 2)) ? lang.slice(0, 2) : 'fr') as Lang,
    activities: ['vtc'],
    dailyGoal: 12000,
    monthlyGoal: 250000,
    onboarded: true,
  };
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const today = todayIn(profile.timezone);
  const days: WorkDay[] = [];
  const expenses: Expense[] = [];
  let odo = 84210;
  for (let i = 75; i >= 1; i--) {
    const date = addDays(today, -i);
    if (rnd() < 0.25) continue; // day off
    const km = Math.round(150 + rnd() * 120);
    const uberGross = Math.round((9000 + rnd() * 9000) / 10) * 10;
    const boltGross = rnd() < 0.5 ? Math.round((3000 + rnd() * 5000) / 10) * 10 : 0;
    const earnings: Earning[] = [
      { id: crypto.randomUUID(), platformId: 'demo-uber', label: '', grossKnown: true, gross: uberGross, commission: Math.round(uberGross * 0.25), otherFees: 0, bonus: 0, bonusIncluded: true, tips: rnd() < 0.4 ? 300 : 0, tipsIncluded: false, netPaid: null, payoutStatus: i > 7 ? 'received' : 'pending' },
    ];
    if (boltGross)
      earnings.push({ id: crypto.randomUUID(), platformId: 'demo-bolt', label: '', grossKnown: true, gross: boltGross, commission: Math.round(boltGross * 0.15), otherFees: 0, bonus: 0, bonusIncluded: true, tips: 0, tipsIncluded: true, netPaid: null, payoutStatus: i > 7 ? 'received' : 'pending' });
    const start = 7 + Math.floor(rnd() * 3);
    const len = 8 + Math.floor(rnd() * 4);
    days.push({
      id: crypto.randomUUID(), date, startTime: `${String(start).padStart(2, '0')}:00`, endTime: `${String((start + len) % 24).padStart(2, '0')}:30`,
      breakMinutes: 60, hoursOverride: null, vehicleId: 'demo-car', odoStart: odo, odoEnd: odo + km, distanceKm: null, personalKm: 0,
      trips: 8 + Math.floor(rnd() * 10), deliveries: null, energyMode: 'estimated', earnings, notes: '',
    });
    odo += km + 15;
    expenses.push({ id: crypto.randomUUID(), date, category: 'food', amount: 800 + Math.round(rnd() * 700), description: '', vehicleId: null, paymentMethod: 'card', kind: 'daily', receiptPath: null });
    if (rnd() < 0.15) expenses.push({ id: crypto.randomUUID(), date, category: 'carwash', amount: 1200, description: '', vehicleId: 'demo-car', paymentMethod: 'card', kind: 'occasional', receiptPath: null });
    if (rnd() < 0.2) expenses.push({ id: crypto.randomUUID(), date, category: 'parking', amount: 400, description: '', vehicleId: 'demo-car', paymentMethod: 'card', kind: 'daily', receiptPath: null });
  }
  return {
    profile,
    vehicles: [
      { id: 'demo-car', name: 'Toyota Corolla', make: 'Toyota', model: 'Corolla Hybrid', year: 2021, type: 'car', fuelType: 'hybrid', consumption: 4.8, energyPrice: 1.85, tankCapacity: 43, odometer: odo, purchasePrice: null, financing: 'lease', maintenanceIntervalKm: 15000, lastMaintenanceKm: odo - 14200, insuranceExpiry: addDays(today, 20), documentsExpiry: null, notes: '', archived: false },
    ],
    platforms: [
      { id: 'demo-uber', name: 'Uber', catalogId: 'uber', commissionPct: 25, notes: '', active: true },
      { id: 'demo-bolt', name: 'Bolt', catalogId: 'bolt', commissionPct: 15, notes: '', active: true },
    ],
    days,
    expenses,
    fixedCosts: [
      { id: crypto.randomUUID(), label: 'Leasing', category: 'leasing', monthlyAmount: 45000, vehicleId: 'demo-car', startDate: days[0].date, endDate: null },
      { id: crypto.randomUUID(), label: 'Insurance', category: 'insurance', monthlyAmount: 18000, vehicleId: 'demo-car', startDate: days[0].date, endDate: null },
      { id: crypto.randomUUID(), label: 'Phone', category: 'phone', monthlyAmount: 2000, vehicleId: null, startDate: days[0].date, endDate: null },
    ],
  };
}
