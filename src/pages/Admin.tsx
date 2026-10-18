import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import i18n from '../i18n';
import fr from '../locales/fr.json';
import { useStore } from '../data/store';
import { supabase } from '../data/supabaseRepo';
import { adminApi, type AdminUser } from '../data/services';
import { useCatalogReload } from '../data/catalog';
import { LANGUAGES } from '../config/catalog';
import { Badge, Button, Card, Checkbox, Input, Notice, PageHeader, Select, Stat, cx } from '../components/ui';
import { formatDate } from '../lib/dates';
import { parseDecimal } from '../lib/money';

type ColType = 'text' | 'number' | 'bool' | 'date' | 'json' | 'select';
interface Col {
  n: string;
  type: ColType;
  req?: boolean;
  options?: string[];
  /** Part of the primary key: read-only when editing. */
  key?: boolean;
}
interface TableDef {
  table: string;
  pk: string[];
  order: string;
  cols: Col[];
  hint?: string;
}

const LANG_CODES = LANGUAGES.map((l) => l.code);
const TABLES: TableDef[] = [
  { table: 'countries', pk: ['code'], order: 'code', cols: [{ n: 'code', type: 'text', req: true, key: true }, { n: 'region', type: 'select', options: ['europe', 'africa', 'americas', 'asia', 'oceania'], req: true }, { n: 'currency', type: 'text', req: true }, { n: 'timezone', type: 'text', req: true }, { n: 'default_language', type: 'select', options: LANG_CODES, req: true }, { n: 'active', type: 'bool' }], hint: 'countries' },
  { table: 'currencies', pk: ['code'], order: 'code', cols: [{ n: 'code', type: 'text', req: true, key: true }, { n: 'minor_digits', type: 'number', req: true }, { n: 'symbol', type: 'text', req: true }] },
  { table: 'cities', pk: ['id'], order: 'name', cols: [{ n: 'country_code', type: 'text', req: true }, { n: 'name', type: 'text', req: true }, { n: 'timezone', type: 'text' }] },
  { table: 'transport_platforms', pk: ['id'], order: 'name', cols: [{ n: 'id', type: 'text', req: true, key: true }, { n: 'name', type: 'text', req: true }, { n: 'kind', type: 'select', options: ['ride_hailing', 'taxi', 'delivery', 'other'], req: true }] },
  { table: 'platform_countries', pk: ['platform_id', 'country_code'], order: 'country_code', cols: [{ n: 'platform_id', type: 'text', req: true, key: true }, { n: 'country_code', type: 'text', req: true, key: true }, { n: 'indicative_commission_pct', type: 'number' }, { n: 'source', type: 'text' }, { n: 'source_date', type: 'date' }], hint: 'sourced' },
  { table: 'expense_categories', pk: ['id'], order: 'sort', cols: [{ n: 'id', type: 'text', req: true, key: true }, { n: 'default_kind', type: 'select', options: ['daily', 'occasional'], req: true }, { n: 'is_energy', type: 'bool' }, { n: 'sort', type: 'number', req: true }], hint: 'categories' },
  { table: 'fuel_prices', pk: ['id'], order: 'valid_from', cols: [{ n: 'country_code', type: 'text', req: true }, { n: 'fuel_type', type: 'select', options: ['petrol', 'diesel', 'lpg'], req: true }, { n: 'price', type: 'number', req: true }, { n: 'currency', type: 'text', req: true }, { n: 'valid_from', type: 'date', req: true }, { n: 'source', type: 'text', req: true }, { n: 'source_url', type: 'text' }], hint: 'sourced' },
  { table: 'energy_prices', pk: ['id'], order: 'valid_from', cols: [{ n: 'country_code', type: 'text', req: true }, { n: 'price_per_kwh', type: 'number', req: true }, { n: 'currency', type: 'text', req: true }, { n: 'tariff', type: 'text', req: true }, { n: 'valid_from', type: 'date', req: true }, { n: 'source', type: 'text', req: true }, { n: 'source_url', type: 'text' }], hint: 'sourced' },
  { table: 'subscription_plans', pk: ['id'], order: 'id', cols: [{ n: 'id', type: 'select', options: ['free', 'pro', 'fleet'], req: true, key: true }, { n: 'features', type: 'json', req: true }, { n: 'limits', type: 'json', req: true }, { n: 'active', type: 'bool' }] },
  { table: 'app_settings', pk: ['key'], order: 'key', cols: [{ n: 'key', type: 'text', req: true, key: true }, { n: 'value', type: 'json', req: true }] },
];

const show = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function RowForm({ def, row, isNew, onSaved, onCancel }: { def: TableDef; row: Record<string, unknown>; isNew: boolean; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [vals, setVals] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(def.cols.map((c) => [c.n, c.type === 'bool' ? row[c.n] !== false : c.type === 'json' ? JSON.stringify(row[c.n] ?? (c.n === 'features' ? [] : {})) : show(row[c.n])])),
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const out: Record<string, unknown> = isNew ? {} : Object.fromEntries(def.pk.map((k) => [k, row[k]]));
    for (const c of def.cols) {
      const v = vals[c.n];
      if (c.type === 'bool') {
        out[c.n] = v;
        continue;
      }
      const s = String(v).trim();
      if (!s) {
        if (c.req) return setError(t('admin.required', { field: c.n }));
        out[c.n] = null;
        continue;
      }
      if (c.type === 'number') {
        const n = parseDecimal(s);
        if (n === null) return setError(t('admin.invalid', { field: c.n }));
        out[c.n] = n;
      } else if (c.type === 'json') {
        try {
          out[c.n] = JSON.parse(s);
        } catch {
          return setError(t('admin.invalidJson', { field: c.n }));
        }
      } else out[c.n] = s;
    }
    try {
      await adminApi(supabase!).upsert(def.table, out, def.pk.join(','));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-3">
      {def.cols.map((c) =>
        c.type === 'bool' ? (
          <div key={c.n} className="flex items-end pb-2">
            <Checkbox checked={!!vals[c.n]} onChange={(v) => setVals({ ...vals, [c.n]: v })} label={c.n} />
          </div>
        ) : c.type === 'select' ? (
          <Select key={c.n} label={c.n + (c.req ? ' *' : '')} value={String(vals[c.n])} disabled={c.key && !isNew} onChange={(e) => setVals({ ...vals, [c.n]: e.target.value })}>
            <option value="">—</option>
            {c.options!.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        ) : (
          <Input
            key={c.n}
            label={c.n + (c.req ? ' *' : '')}
            type={c.type === 'date' ? 'date' : 'text'}
            inputMode={c.type === 'number' ? 'decimal' : undefined}
            value={String(vals[c.n])}
            disabled={c.key && !isNew}
            className={c.type === 'json' ? 'font-mono text-xs' : undefined}
            onChange={(e) => setVals({ ...vals, [c.n]: e.target.value })}
          />
        ),
      )}
      {error && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Notice tone="loss">{error}</Notice>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit">{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function ReferenceEditor() {
  const { t } = useTranslation();
  const reloadCatalog = useCatalogReload();
  const [table, setTable] = useState(TABLES[0].table);
  const def = TABLES.find((d) => d.table === table)!;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<{ row: Record<string, unknown>; isNew: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    adminApi(supabase!).list(def.table, def.order).then(setRows).catch((e) => setError(e.message));
  }, [def]);
  useEffect(() => {
    setEditing(null);
    load();
  }, [load]);
  const filtered = rows.filter((r) => !q || Object.values(r).some((v) => show(v).toLowerCase().includes(q.toLowerCase())));
  const after = () => {
    setEditing(null);
    load();
    reloadCatalog();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60">
          <Select label={t('admin.table')} value={table} onChange={(e) => setTable(e.target.value)}>
            {TABLES.map((d) => (
              <option key={d.table} value={d.table}>
                {t(`admin.tables.${d.table}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-60">
          <Input label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setEditing({ row: {}, isNew: true })}>
          <Plus className="h-4 w-4" aria-hidden /> {t('common.add')}
        </Button>
      </div>
      {def.hint && <Notice>{t(`admin.hints.${def.hint}`)}</Notice>}
      {error && <Notice tone="loss">{error}</Notice>}
      {editing && <RowForm key={JSON.stringify(editing.row)} def={def} row={editing.row} isNew={editing.isNew} onSaved={after} onCancel={() => setEditing(null)} />}
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              {def.cols.map((c) => (
                <th key={c.n} className="px-3 py-2 font-medium">
                  {c.n}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {def.cols.map((c) => (
                  <td key={c.n} className={cx('max-w-[16rem] truncate px-3 py-1.5', c.type === 'json' && 'font-mono text-xs')} title={show(r[c.n])}>
                    {c.type === 'bool' ? (r[c.n] ? '✓' : '—') : show(r[c.n])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <Button variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing({ row: r, isNew: false })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (!confirm(t('common.confirmDelete'))) return;
                      try {
                        await adminApi(supabase!).remove(def.table, Object.fromEntries(def.pk.map((k) => [k, r[k]])));
                        after();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">{t('admin.rowCount', { count: filtered.length })}</p>
    </div>
  );
}

type Tree = { [k: string]: string | Tree };
const flatKeys = (o: Tree, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : flatKeys(v, `${p}${k}.`)));
const ALL_KEYS = flatKeys(fr as Tree);

function Translations() {
  const { t } = useTranslation();
  const [lang, setLang] = useState('fr');
  const [q, setQ] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [overrides, setOverrides] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => adminApi(supabase!).list('translations_overrides', 'key').then(setOverrides).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const base = (k: string) => {
    const bundle = i18n.getResourceBundle(lang, 'translation') as Tree;
    const fromBundle = k.split('.').reduce<unknown>((o, p) => (o as Tree)?.[p], bundle);
    return typeof fromBundle === 'string' ? fromBundle : '';
  };
  const matches = q.length >= 2 ? ALL_KEYS.filter((k) => k.toLowerCase().includes(q.toLowerCase()) || base(k).toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  const mine = overrides.filter((o) => o.lang === lang);

  return (
    <div className="space-y-4">
      <Notice>{t('admin.translationsHint')}</Notice>
      {error && <Notice tone="loss">{error}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select label={t('settings.language')} value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-60 flex-1">
          <Input label={t('admin.searchKey')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="countries.TG, dashboard.profit…" />
        </div>
      </div>
      {matches.length > 0 && (
        <Card className="max-h-64 overflow-auto p-0 sm:p-0">
          <ul className="divide-y divide-slate-100 text-sm">
            {matches.map((k) => (
              <li key={k}>
                <button className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setKey(k); setValue(String(mine.find((o) => o.key === k)?.value ?? base(k))); }}>
                  <span className="font-mono text-xs text-brand-700">{k}</span> — {base(k)}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {q.length >= 2 && /^[a-zA-Z0-9_.]+$/.test(q) && !ALL_KEYS.includes(q) && (
        <Button variant="ghost" onClick={() => { setKey(q); setValue(''); }}>
          <Plus className="h-4 w-4" aria-hidden /> {t('admin.newKey', { key: q })}
        </Button>
      )}
      {key && (
        <Card title={<span className="font-mono text-sm">{key}</span>}>
          {base(key) && <p className="mb-2 text-xs text-slate-500">{t('admin.defaultText')}: {base(key)}</p>}
          <Input label={t('admin.override', { lang })} value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <Button
              disabled={!value.trim()}
              onClick={async () => {
                try {
                  await adminApi(supabase!).upsert('translations_overrides', { lang, key, value }, 'lang,key');
                  i18n.addResource(lang, 'translation', key, value);
                  setKey(null);
                  load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t('common.save')}
            </Button>
            <Button variant="secondary" onClick={() => setKey(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}
      <Card title={t('admin.activeOverrides', { count: mine.length })}>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">{t('common.noData')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {mine.map((o) => (
              <li key={String(o.key)} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono text-xs text-brand-700">{String(o.key)}</span> — {String(o.value)}
                </span>
                <Button
                  variant="ghost"
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    await adminApi(supabase!).remove('translations_overrides', { lang, key: o.key });
                    load();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">{t('admin.overrideReload')}</p>
      </Card>
    </div>
  );
}

function Users() {
  const { t } = useTranslation();
  const { locale, session } = useStore();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 25;
  const load = useCallback(() => adminApi(supabase!).users(q, PAGE, page * PAGE).then(setUsers).catch((e) => setError(e.message)), [q, page]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const total = users[0]?.total ?? 0;
  return (
    <div className="space-y-4">
      <Notice>{t('admin.usersPrivacy')}</Notice>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); load(); }}>
        <div className="w-72">
          <Input label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchUsers')} />
        </div>
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" aria-hidden />
        </Button>
      </form>
      {error && <Notice tone="loss">{error}</Notice>}
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">{t('auth.email')}</th>
              <th className="px-3 py-2">{t('profile.country')}</th>
              <th className="px-3 py-2">{t('admin.createdAt')}</th>
              <th className="px-3 py-2">{t('admin.lastSignIn')}</th>
              <th className="px-3 py-2">{t('admin.plan')}</th>
              <th className="px-3 py-2">{t('admin.status')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === session?.user.id;
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <p className="font-medium">{u.email}</p>
                    {u.displayName && <p className="text-xs text-slate-500">{u.displayName}</p>}
                  </td>
                  <td className="px-3 py-2">{u.countryCode ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(u.createdAt.slice(0, 10), locale)}</td>
                  <td className="px-3 py-2 text-xs">{u.lastSignInAt ? formatDate(u.lastSignInAt.slice(0, 10), locale) : '—'}</td>
                  <td className="px-3 py-2">
                    <select aria-label={t('admin.plan')} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={u.plan ?? 'free'} onChange={(e) => act(() => adminApi(supabase!).setPlan(u.id, e.target.value))}>
                      {['free', 'pro', 'fleet'].map((p) => (
                        <option key={p} value={p}>
                          {t(`pricing.plans.${p}.name`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="space-x-1 px-3 py-2">
                    {u.isAdmin && <Badge tone="info">admin</Badge>}
                    {u.banned && <Badge tone="loss">{t('admin.suspended')}</Badge>}
                    {!u.onboarded && <Badge>{t('admin.notOnboarded')}</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {!self && (
                      <>
                        <Button variant="ghost" onClick={() => act(() => adminApi(supabase!).setAdmin(u.id, !u.isAdmin))}>
                          {u.isAdmin ? t('admin.revokeAdmin') : t('admin.grantAdmin')}
                        </Button>
                        <Button variant="ghost" onClick={() => confirm(t(u.banned ? 'admin.confirmReactivate' : 'admin.confirmSuspend', { email: u.email })) && act(() => adminApi(supabase!).setSuspended(u.id, !u.banned))}>
                          {u.banned ? t('admin.reactivate') : t('admin.suspend')}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="flex items-center gap-3 text-sm">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
          {t('common.previous')}
        </Button>
        <span>{t('admin.pageOf', { from: total ? page * PAGE + 1 : 0, to: Math.min(total, (page + 1) * PAGE), total })}</span>
        <Button variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}

function Overview() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [orgs, setOrgs] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    adminApi(supabase!).stats().then(setStats);
    adminApi(supabase!).organizations().then(setOrgs);
  }, []);
  if (!stats) return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  const n = (k: string) => Number(stats[k] ?? 0);
  const dist = (k: string, label: (x: string) => string) =>
    Object.entries((stats[k] ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .map(([x, c]) => (
        <li key={x} className="flex justify-between py-1">
          <span>{label(x)}</span>
          <span className="tabular font-semibold">{c}</span>
        </li>
      ));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('admin.kpi.users')} value={n('users')} sub={t('admin.kpi.onboarded', { count: n('onboarded') })} />
        <Stat label={t('admin.kpi.active7')} value={n('active_7d')} sub={t('admin.kpi.active30', { count: n('active_30d') })} />
        <Stat label={t('admin.kpi.sessions30')} value={n('work_sessions_30d')} />
        <Stat label={t('admin.kpi.orgs')} value={n('organizations')} sub={t('admin.kpi.push', { count: n('push_devices') })} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={t('admin.byCountry')}>
          <ul className="divide-y divide-slate-100 text-sm">{dist('users_by_country', (x) => t(`countries.${x}`, { defaultValue: x }))}</ul>
        </Card>
        <Card title={t('admin.byLanguage')}>
          <ul className="divide-y divide-slate-100 text-sm">{dist('users_by_language', (x) => LANGUAGES.find((l) => l.code === x)?.label ?? x)}</ul>
        </Card>
        <Card title={t('admin.byPlan')}>
          <ul className="divide-y divide-slate-100 text-sm">{dist('subscriptions_by_plan', (x) => t(`pricing.plans.${x}.name`, { defaultValue: x }))}</ul>
          <p className="mt-2 text-xs text-slate-500">{t('admin.planNote')}</p>
        </Card>
      </div>
      <Card title={t('admin.organizations')} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">{t('fleet.name')}</th>
              <th className="py-1">{t('settings.currency')}</th>
              <th className="py-1 text-right">{t('admin.members')}</th>
              <th className="py-1 text-right">{t('admin.sharing')}</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={String(o.id)} className="border-t border-slate-100">
                <td className="py-1.5">{String(o.name)}</td>
                <td className="py-1.5">{show(o.currency)}</td>
                <td className="tabular py-1.5 text-right">{String(o.members)}</td>
                <td className="tabular py-1.5 text-right">{String(o.sharing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">{t('admin.aggregatedOnly')}</p>
    </div>
  );
}

function Audit() {
  const { t } = useTranslation();
  const { locale } = useStore();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    adminApi(supabase!).audit(200).then(setRows);
  }, []);
  return (
    <Card className="overflow-x-auto p-0 sm:p-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="px-3 py-2">{t('common.date')}</th>
            <th className="px-3 py-2">{t('admin.action')}</th>
            <th className="px-3 py-2">{t('admin.table')}</th>
            <th className="px-3 py-2">{t('admin.target')}</th>
            <th className="px-3 py-2">{t('admin.actor')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-3 py-1.5 text-xs">{new Date(String(r.created_at)).toLocaleString(locale)}</td>
              <td className="px-3 py-1.5"><Badge>{String(r.action)}</Badge></td>
              <td className="px-3 py-1.5">{show(r.target_table)}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{show(r.target_id)}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{show(r.actor).slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const TABS = ['overview', 'users', 'reference', 'translations', 'audit'] as const;

/** Access is decided by the database (platform_admins + RLS + SECURITY DEFINER checks). */
export function Admin() {
  const { t } = useTranslation();
  const { mode, isAdmin } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview');
  const content = useMemo(() => ({ overview: <Overview />, users: <Users />, reference: <ReferenceEditor />, translations: <Translations />, audit: <Audit /> }), []);
  if (mode !== 'supabase') return (<><PageHeader title={t('admin.title')} /><Notice>{t('admin.needsAccount')}</Notice></>);
  if (!isAdmin) return (<><PageHeader title={t('admin.title')} /><Notice tone="loss">{t('admin.denied')}</Notice></>);
  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div role="tablist" aria-label={t('admin.title')} className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('-mb-px min-h-10 border-b-2 px-3 text-sm font-medium', tab === k ? 'border-brand-800 text-brand-900' : 'border-transparent text-slate-500 hover:text-brand-900')}>
            {t(`admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      {content[tab]}
    </div>
  );
}
