/**
 * Reference data. Adding a country = adding one entry here (and the matching seed row in
 * supabase/migrations). No official tariff, commission or tax rate is hard-coded: platforms are
 * suggestions only, and every rate is entered by the driver or by an admin with a dated source.
 */
import type { AlertKind, ExpenseKind, FuelType, Lang, VehicleType } from '../domain/types';

export interface Country {
  code: string;
  region: 'europe' | 'africa';
  currency: string;
  timezone: string;
  defaultLanguage: Lang;
  /** Catalog ids of platforms commonly found there — a suggestion, the driver picks what they use. */
  suggestedPlatforms: string[];
  activities: string[];
}

export const COUNTRIES: Country[] = [
  { code: 'PT', region: 'europe', currency: 'EUR', timezone: 'Europe/Lisbon', defaultLanguage: 'pt', suggestedPlatforms: ['uber', 'bolt', 'freenow', 'uber_eats', 'glovo'], activities: ['tvde', 'taxi', 'delivery', 'independent'] },
  { code: 'FR', region: 'europe', currency: 'EUR', timezone: 'Europe/Paris', defaultLanguage: 'fr', suggestedPlatforms: ['uber', 'bolt', 'heetch', 'freenow', 'uber_eats', 'deliveroo'], activities: ['vtc', 'taxi', 'delivery', 'independent'] },
  { code: 'DE', region: 'europe', currency: 'EUR', timezone: 'Europe/Berlin', defaultLanguage: 'de', suggestedPlatforms: ['uber', 'bolt', 'freenow', 'uber_eats', 'wolt'], activities: ['vtc', 'taxi', 'delivery', 'independent'] },
  { code: 'BE', region: 'europe', currency: 'EUR', timezone: 'Europe/Brussels', defaultLanguage: 'fr', suggestedPlatforms: ['uber', 'bolt', 'heetch', 'deliveroo'], activities: ['vtc', 'taxi', 'delivery', 'independent'] },
  { code: 'ES', region: 'europe', currency: 'EUR', timezone: 'Europe/Madrid', defaultLanguage: 'es', suggestedPlatforms: ['uber', 'bolt', 'cabify', 'freenow', 'glovo'], activities: ['vtc', 'taxi', 'delivery', 'independent'] },
  { code: 'IT', region: 'europe', currency: 'EUR', timezone: 'Europe/Rome', defaultLanguage: 'it', suggestedPlatforms: ['uber', 'freenow', 'glovo', 'deliveroo'], activities: ['vtc', 'taxi', 'delivery', 'independent'] },
  { code: 'CI', region: 'africa', currency: 'XOF', timezone: 'Africa/Abidjan', defaultLanguage: 'fr', suggestedPlatforms: ['yango', 'uber', 'heetch', 'gozem', 'glovo'], activities: ['vtc', 'taxi', 'moto_taxi', 'delivery', 'independent'] },
  { code: 'CM', region: 'africa', currency: 'XAF', timezone: 'Africa/Douala', defaultLanguage: 'fr', suggestedPlatforms: ['yango', 'gozem', 'heetch'], activities: ['taxi', 'moto_taxi', 'vtc', 'delivery', 'independent'] },
  { code: 'ML', region: 'africa', currency: 'XOF', timezone: 'Africa/Bamako', defaultLanguage: 'fr', suggestedPlatforms: ['yango'], activities: ['taxi', 'moto_taxi', 'urban_transport', 'delivery', 'independent'] },
  { code: 'BF', region: 'africa', currency: 'XOF', timezone: 'Africa/Ouagadougou', defaultLanguage: 'fr', suggestedPlatforms: ['yango'], activities: ['taxi', 'moto_taxi', 'delivery', 'independent'] },
  { code: 'SN', region: 'africa', currency: 'XOF', timezone: 'Africa/Dakar', defaultLanguage: 'fr', suggestedPlatforms: ['yango', 'heetch', 'uber'], activities: ['taxi', 'moto_taxi', 'vtc', 'delivery', 'independent'] },
  { code: 'GN', region: 'africa', currency: 'GNF', timezone: 'Africa/Conakry', defaultLanguage: 'fr', suggestedPlatforms: ['yango'], activities: ['taxi', 'moto_taxi', 'delivery', 'independent'] },
];

export const CURRENCIES = ['EUR', 'XOF', 'XAF', 'GNF', 'USD', 'GBP', 'CHF', 'MAD'];

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
];

export const PLATFORM_CATALOG: { id: string; name: string }[] = [
  { id: 'uber', name: 'Uber' },
  { id: 'bolt', name: 'Bolt' },
  { id: 'yango', name: 'Yango' },
  { id: 'heetch', name: 'Heetch' },
  { id: 'freenow', name: 'FREENOW' },
  { id: 'cabify', name: 'Cabify' },
  { id: 'gozem', name: 'Gozem' },
  { id: 'uber_eats', name: 'Uber Eats' },
  { id: 'glovo', name: 'Glovo' },
  { id: 'deliveroo', name: 'Deliveroo' },
  { id: 'wolt', name: 'Wolt' },
  { id: 'taxi', name: 'Taxi' },
];

export const ACTIVITIES = ['vtc', 'tvde', 'taxi', 'moto_taxi', 'delivery', 'urban_transport', 'independent', 'fleet', 'other'];

export const VEHICLE_TYPES: VehicleType[] = ['car', 'moto', 'scooter', 'van', 'other'];
export const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'lpg', 'hybrid', 'electric', 'other'];

export const EXPENSE_CATEGORIES: { id: string; defaultKind: ExpenseKind }[] = [
  { id: 'fuel', defaultKind: 'daily' },
  { id: 'charging', defaultKind: 'daily' },
  { id: 'food', defaultKind: 'daily' },
  { id: 'drinks', defaultKind: 'daily' },
  { id: 'cleaning', defaultKind: 'occasional' },
  { id: 'carwash', defaultKind: 'occasional' },
  { id: 'maintenance', defaultKind: 'occasional' },
  { id: 'repair', defaultKind: 'occasional' },
  { id: 'tyres', defaultKind: 'occasional' },
  { id: 'parking', defaultKind: 'daily' },
  { id: 'tolls', defaultKind: 'daily' },
  { id: 'insurance', defaultKind: 'occasional' },
  { id: 'rental', defaultKind: 'occasional' },
  { id: 'leasing', defaultKind: 'occasional' },
  { id: 'phone', defaultKind: 'occasional' },
  { id: 'admin', defaultKind: 'occasional' },
  { id: 'platform_fees', defaultKind: 'occasional' },
  { id: 'misc', defaultKind: 'daily' },
];

export const FIXED_COST_CATEGORIES = ['insurance', 'leasing', 'loan', 'rental', 'tax', 'licence', 'phone', 'accounting', 'parking', 'maintenance_plan', 'other'];

export const ALERT_KINDS: AlertKind[] = ['dailyReminder', 'unusualExpense', 'dailyGoalReached', 'monthlyGoalBehind', 'hourlyDecline', 'maintenanceDue', 'documentExpiry'];

export interface Plan {
  id: 'free' | 'pro' | 'fleet';
  features: string[];
}

/** Plans are display/config only: no payment is wired and nothing is locked during development. */
export const PLANS: Plan[] = [
  { id: 'free', features: ['days', 'profit', 'dashboard', 'history90'] },
  { id: 'pro', features: ['fullHistory', 'advancedStats', 'reports', 'compare', 'goals', 'multiVehicle'] },
  { id: 'fleet', features: ['multiDriver', 'fleetVehicles', 'consolidated', 'access', 'fleetKpi'] },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);
