import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import i18n from '../i18n';
import {
  COUNTRIES,
  EXPENSE_CATEGORIES,
  PLANS,
  PLATFORM_CATALOG,
  type Country,
  type Plan,
} from '../config/catalog';
import type { ExpenseKind, FuelType } from '../domain/types';
import { supabase } from './supabaseRepo';

export interface IndicativePrice {
  countryCode: string;
  fuelType: FuelType | 'electric';
  price: number;
  currency: string;
  validFrom: string;
  source: string;
  sourceUrl: string | null;
}

export interface Catalog {
  source: 'static' | 'server';
  countries: Country[];
  platforms: { id: string; name: string }[];
  categories: { id: string; defaultKind: ExpenseKind }[];
  plans: Plan[];
  prices: IndicativePrice[];
  settings: Record<string, unknown>;
  countryByCode: (code: string) => Country | undefined;
  /** Latest dated, sourced indicative price for a country and energy, if an admin published one. */
  indicativePrice: (countryCode: string, fuel: FuelType) => IndicativePrice | undefined;
}

const DEFAULT_ACTIVITIES = { europe: ['vtc', 'taxi', 'delivery', 'independent'], africa: ['taxi', 'moto_taxi', 'vtc', 'delivery', 'independent'] };

function build(partial: Omit<Catalog, 'countryByCode' | 'indicativePrice'>): Catalog {
  return {
    ...partial,
    countryByCode: (code) => partial.countries.find((c) => c.code === code),
    indicativePrice: (countryCode, fuel) =>
      partial.prices
        .filter((p) => p.countryCode === countryCode && p.fuelType === fuel)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0],
  };
}

export const STATIC_CATALOG = build({
  source: 'static',
  countries: COUNTRIES,
  platforms: PLATFORM_CATALOG,
  categories: EXPENSE_CATEGORIES,
  plans: PLANS,
  prices: [],
  settings: {},
});

type Row = Record<string, unknown>;

/**
 * Reads the reference tables administrators maintain. Public read access, so it also works
 * signed out. Falls back to the bundled catalog when no server is configured or reachable.
 */
export async function loadServerCatalog(): Promise<Catalog | null> {
  if (!supabase) return null;
  const get = async (table: string) => {
    const { data, error } = await supabase!.from(table).select('*');
    if (error) throw error;
    return (data ?? []) as Row[];
  };
  try {
    const [countries, platforms, platformCountries, categories, plans, fuel, energy, overrides, settings] = await Promise.all([
      get('countries'), get('transport_platforms'), get('platform_countries'), get('expense_categories'),
      get('subscription_plans'), get('fuel_prices'), get('energy_prices'), get('translations_overrides'), get('app_settings'),
    ]);
    for (const o of overrides) i18n.addResource(o.lang as string, 'translation', o.key as string, o.value as string);
    const staticCountry = new Map(COUNTRIES.map((c) => [c.code, c]));
    return build({
      source: 'server',
      countries: countries
        .filter((c) => c.active)
        .map((c) => {
          const code = c.code as string;
          const region: Country['region'] = c.region === 'africa' ? 'africa' : 'europe';
          return {
            code,
            region,
            currency: c.currency as string,
            timezone: c.timezone as string,
            defaultLanguage: c.default_language as Country['defaultLanguage'],
            suggestedPlatforms: platformCountries.filter((p) => p.country_code === code).map((p) => p.platform_id as string),
            activities: staticCountry.get(code)?.activities ?? DEFAULT_ACTIVITIES[region],
          };
        })
        .sort((a, b) => a.region.localeCompare(b.region) || a.code.localeCompare(b.code)),
      platforms: platforms.map((p) => ({ id: p.id as string, name: p.name as string })).sort((a, b) => a.name.localeCompare(b.name)),
      categories: categories
        .sort((a, b) => Number(a.sort) - Number(b.sort))
        .map((c) => ({ id: c.id as string, defaultKind: c.default_kind as ExpenseKind })),
      plans: plans
        .filter((p) => p.active)
        .map((p) => ({ id: p.id as Plan['id'], features: (p.features as string[]) ?? [] }))
        .sort((a, b) => ['free', 'pro', 'fleet'].indexOf(a.id) - ['free', 'pro', 'fleet'].indexOf(b.id)),
      prices: [
        ...fuel.map((f) => ({ countryCode: f.country_code as string, fuelType: f.fuel_type as FuelType, price: Number(f.price), currency: f.currency as string, validFrom: f.valid_from as string, source: f.source as string, sourceUrl: (f.source_url as string) ?? null })),
        ...energy.map((f) => ({ countryCode: f.country_code as string, fuelType: 'electric' as const, price: Number(f.price_per_kwh), currency: f.currency as string, validFrom: f.valid_from as string, source: f.source as string, sourceUrl: (f.source_url as string) ?? null })),
      ],
      settings: Object.fromEntries(settings.map((s) => [s.key as string, s.value])),
    });
  } catch {
    return null;
  }
}

const Ctx = createContext<{ catalog: Catalog; reload: () => Promise<void> }>({ catalog: STATIC_CATALOG, reload: async () => {} });

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>(STATIC_CATALOG);
  const reload = async () => {
    const c = await loadServerCatalog();
    if (c) setCatalog(c);
  };
  useEffect(() => {
    reload();
  }, []);
  const value = useMemo(() => ({ catalog, reload }), [catalog]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx).catalog;
export const useCatalogReload = () => useContext(Ctx).reload;
