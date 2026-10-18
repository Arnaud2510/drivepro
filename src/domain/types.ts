/**
 * Domain model. All monetary amounts are stored as integers in the minor unit
 * of the user's currency (cents for EUR, francs for XOF/XAF/GNF which have no
 * decimals). Unit prices of energy (per litre / per kWh) are kept as decimal
 * numbers in major units because they routinely carry 3 decimals (1.789 €/L);
 * every computed cost is rounded once to the minor unit.
 */
export type Minor = number;
export type ISODate = string; // YYYY-MM-DD in the user's time zone
export type Lang = 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it';

export type VehicleType = 'car' | 'moto' | 'scooter' | 'van' | 'other';
export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'hybrid' | 'electric' | 'other';
export type Financing = 'owned' | 'loan' | 'lease' | 'rental' | 'other';
export type EnergyMode = 'estimated' | 'actual';
export type FixedCostMethod = 'calendar_day' | 'worked_day' | 'separate';
export type PayoutStatus = 'estimated' | 'pending' | 'received';
export type ExpenseKind = 'daily' | 'occasional';
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'transfer' | 'other';

export type AlertKind =
  | 'dailyReminder'
  | 'unusualExpense'
  | 'dailyGoalReached'
  | 'monthlyGoalBehind'
  | 'hourlyDecline'
  | 'maintenanceDue'
  | 'documentExpiry';

export interface Profile {
  id: string;
  displayName: string;
  countryCode: string;
  city: string;
  language: Lang;
  currency: string;
  timezone: string;
  activities: string[];
  dailyGoal: Minor | null;
  monthlyGoal: Minor | null;
  fixedCostMethod: FixedCostMethod;
  /** Planned working days per month, used by the worked_day allocation and the planned projection. */
  plannedWorkDays: number;
  defaultEnergyMode: EnergyMode;
  /** User-defined provision rate. Never pre-filled by the app. */
  taxProvisionPct: number | null;
  taxNote: string;
  notificationPrefs: Record<AlertKind, boolean>;
  onboarded: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number | null;
  type: VehicleType;
  fuelType: FuelType;
  /** L/100 km for combustion engines, kWh/100 km for electric vehicles. */
  consumption: number | null;
  /** Price per litre or per kWh, in major units of the profile currency. */
  energyPrice: number | null;
  tankCapacity: number | null;
  odometer: number | null;
  purchasePrice: Minor | null;
  financing: Financing;
  maintenanceIntervalKm: number | null;
  lastMaintenanceKm: number | null;
  insuranceExpiry: ISODate | null;
  documentsExpiry: ISODate | null;
  notes: string;
  archived: boolean;
}

/** A monthly recurring charge (insurance, leasing, licence, phone plan...). */
export interface FixedCost {
  id: string;
  label: string;
  category: string;
  monthlyAmount: Minor;
  vehicleId: string | null;
  startDate: ISODate;
  endDate: ISODate | null;
}

export interface UserPlatform {
  id: string;
  name: string;
  catalogId: string | null;
  /** Usual commission in %, as configured by the driver. Used only when the real commission is unknown. */
  commissionPct: number | null;
  notes: string;
  active: boolean;
}

export interface Earning {
  id: string;
  /** null = private ride / direct payment. */
  platformId: string | null;
  label: string;
  /** false when the driver only knows what the platform paid out. */
  grossKnown: boolean;
  /** Fares paid by customers, before commission. */
  gross: Minor | null;
  /** Commission actually withheld. null = unknown. */
  commission: Minor | null;
  otherFees: Minor;
  bonus: Minor;
  /** true when the bonus is already part of `gross`. */
  bonusIncluded: boolean;
  tips: Minor;
  tipsIncluded: boolean;
  /** Amount actually paid out to the driver (incl. bonus & tips). */
  netPaid: Minor | null;
  payoutStatus: PayoutStatus;
}

export interface WorkDay {
  id: string;
  date: ISODate;
  startTime: string | null; // HH:MM
  endTime: string | null;
  breakMinutes: number;
  /** Explicit active hours; overrides start/end/break when set. */
  hoursOverride: number | null;
  vehicleId: string | null;
  odoStart: number | null;
  odoEnd: number | null;
  /** Direct distance entry when odometer readings are unavailable. */
  distanceKm: number | null;
  personalKm: number;
  trips: number | null;
  deliveries: number | null;
  energyMode: EnergyMode;
  earnings: Earning[];
  notes: string;
}

export interface Expense {
  id: string;
  date: ISODate;
  category: string;
  amount: Minor;
  description: string;
  vehicleId: string | null;
  paymentMethod: PaymentMethod;
  kind: ExpenseKind;
  receiptPath: string | null;
}

export interface UserData {
  profile: Profile | null;
  vehicles: Vehicle[];
  platforms: UserPlatform[];
  days: WorkDay[];
  expenses: Expense[];
  fixedCosts: FixedCost[];
}

export const ENERGY_CATEGORIES = ['fuel', 'charging'] as const;
export const isEnergyCategory = (c: string) => (ENERGY_CATEGORIES as readonly string[]).includes(c);
