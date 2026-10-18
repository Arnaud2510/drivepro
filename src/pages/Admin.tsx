import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../data/store';
import { supabase } from '../data/supabaseRepo';
import { COUNTRIES, PLATFORM_CATALOG } from '../config/catalog';
import { Card, InDevelopment, Notice, PageHeader } from '../components/ui';

/**
 * Admin console. Access is decided server-side (platform_admins + RLS); this page only
 * reads aggregated statistics through the admin_stats() function, never individual finances.
 */
export function Admin() {
  const { t } = useTranslation();
  const { mode } = useStore();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (mode !== 'supabase' || !supabase) return;
    supabase.rpc('admin_stats').then(({ data, error }) => (error ? setDenied(true) : setStats(data)));
  }, [mode]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.title')} />
      <InDevelopment>{t('admin.status')}</InDevelopment>
      {mode !== 'supabase' && <Notice>{t('admin.needsAccount')}</Notice>}
      {denied && <Notice tone="loss">{t('admin.denied')}</Notice>}
      {stats && (
        <Card title={t('admin.stats')}>
          <pre className="overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(stats, null, 2)}</pre>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('admin.countries')}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th>{t('profile.country')}</th><th>{t('settings.currency')}</th><th>{t('settings.timezone')}</th></tr></thead>
            <tbody>
              {COUNTRIES.map((c) => (
                <tr key={c.code} className="border-t border-slate-100"><td className="py-1">{t(`countries.${c.code}`)}</td><td>{c.currency}</td><td className="text-xs">{c.timezone}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={t('admin.platforms')}>
          <ul className="flex flex-wrap gap-2 text-sm">{PLATFORM_CATALOG.map((p) => <li key={p.id} className="rounded-full bg-slate-100 px-3 py-1">{p.name}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">{t('admin.noTariffs')}</p>
        </Card>
      </div>
    </div>
  );
}
