import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fr from './fr.json';
import en from './en.json';
import es from './es.json';
import pt from './pt.json';
import de from './de.json';
import it_ from './it.json';
import { ALERT_KINDS, COUNTRIES, EXPENSE_CATEGORIES, FIXED_COST_CATEGORIES, FUEL_TYPES, VEHICLE_TYPES, ACTIVITIES, PLANS } from '../config/catalog';

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : flat(v, `${p}${k}.`)));
const has = (keys: Set<string>, k: string) => keys.has(k) || keys.has(`${k}_one`);

const frKeys = new Set(flat(fr as Tree));
const locales = { en, es, pt, de, it: it_ } as Record<string, Tree>;

describe('translations', () => {
  for (const [lang, tree] of Object.entries(locales)) {
    it(`${lang} has exactly the same keys as fr`, () => {
      const keys = new Set(flat(tree));
      expect([...frKeys].filter((k) => !keys.has(k))).toEqual([]);
      expect([...keys].filter((k) => !frKeys.has(k))).toEqual([]);
    });
    it(`${lang} keeps interpolation variables`, () => {
      const get = (t: Tree, k: string) => k.split('.').reduce<unknown>((o, p) => (o as Tree)?.[p], t) as string;
      for (const k of frKeys) {
        const vars = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join();
        expect(vars(get(tree, k)), `${lang}:${k}`).toBe(vars(get(fr as Tree, k)));
      }
    });
  }

  it('every static key used in the source exists', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !f.endsWith('.test.ts')) files.push(p);
      });
    walk(join(__dirname, '..'));
    const missing = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!has(frKeys, m[1])) missing.add(m[1]);
      for (const m of src.matchAll(/key: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) if (!has(frKeys, m[1])) missing.add(m[1]);
    }
    expect([...missing]).toEqual([]);
  });

  it('every catalog entry is translated', () => {
    const need = [
      ...COUNTRIES.map((c) => `countries.${c.code}`),
      ...EXPENSE_CATEGORIES.map((c) => `categories.${c.id}`),
      ...FIXED_COST_CATEGORIES.map((c) => `fixedCategories.${c}`),
      ...FUEL_TYPES.map((c) => `fuelTypes.${c}`),
      ...VEHICLE_TYPES.map((c) => `vehicleTypes.${c}`),
      ...ACTIVITIES.map((c) => `activities.${c}`),
      ...ALERT_KINDS.flatMap((k) => [`alerts.${k}`, `alertNames.${k}`]),
      ...PLANS.flatMap((p) => [`pricing.plans.${p.id}.name`, ...p.features.map((f) => `pricing.features.${f}`)]),
    ];
    expect(need.filter((k) => !frKeys.has(k))).toEqual([]);
  });
});
