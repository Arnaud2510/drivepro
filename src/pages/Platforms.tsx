import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Pencil, Plus, Archive } from 'lucide-react';
import { useStore } from '../data/store';
import { newId } from '../data/repository';
import type { UserPlatform } from '../domain/types';
import { useCatalog } from '../data/catalog';
import { Badge, Button, Card, EmptyState, Input, Notice, NumberInput, PageHeader, Select } from '../components/ui';

const blank = (): UserPlatform => ({ id: newId(), name: '', catalogId: null, commissionPct: null, notes: '', active: true });

export function Platforms() {
  const { t } = useTranslation();
  const { data, upsert, profile } = useStore();
  const [editing, setEditing] = useState<UserPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { platforms: PLATFORM_CATALOG, countryByCode } = useCatalog();
  const suggested = countryByCode(profile?.countryCode ?? '')?.suggestedPlatforms ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title={t('platforms.title')} subtitle={t('platforms.subtitle')} actions={<Button onClick={() => setEditing(blank())}><Plus className="h-4 w-4" aria-hidden /> {t('platforms.add')}</Button>} />
      <Notice>{t('platforms.noIntegration')}</Notice>
      {editing && (
        <Card title={t('platforms.add')}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editing.name.trim()) return setError(t('errors.required'));
              await upsert('platforms', { ...editing, name: editing.name.trim() });
              setEditing(null);
              setError(null);
            }}
          >
            <Select
              label={t('platforms.fromCatalog')}
              value={editing.catalogId ?? ''}
              onChange={(e) => {
                const c = PLATFORM_CATALOG.find((x) => x.id === e.target.value);
                setEditing({ ...editing, catalogId: c?.id ?? null, name: c?.name ?? editing.name });
              }}
            >
              <option value="">{t('platforms.custom')}</option>
              {[...PLATFORM_CATALOG].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id))).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {suggested.includes(c.id) ? ` ★` : ''}
                </option>
              ))}
            </Select>
            <Input label={t('platforms.name')} value={editing.name} error={error} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <NumberInput label={t('platforms.commissionPct')} suffix="%" max={100} value={editing.commissionPct} onChange={(v) => setEditing({ ...editing, commissionPct: v })} hint={t('platforms.commissionHint')} />
            <Input label={t('common.notes')} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">{t('common.save')}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      {data.platforms.length === 0 && !editing ? (
        <EmptyState icon={<Layers className="h-8 w-8" />} title={t('platforms.empty')} action={<Button onClick={() => setEditing(blank())}>{t('platforms.add')}</Button>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.platforms.map((p) => (
            <li key={p.id}>
              <Card
                title={<span className="flex items-center gap-2">{p.name} {!p.active && <Badge>{t('common.archived')}</Badge>}</span>}
                action={
                  <div className="flex gap-1">
                    <Button variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" aria-label={p.active ? t('common.archive') : t('common.restore')} onClick={() => upsert('platforms', { ...p, active: !p.active })}><Archive className="h-4 w-4" /></Button>
                  </div>
                }
              >
                <p className="text-sm text-slate-600">
                  {t('platforms.commissionPct')}: {p.commissionPct != null ? `${p.commissionPct} %` : t('platforms.notSet')}
                </p>
                {p.notes && <p className="mt-1 text-sm text-slate-500">{p.notes}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
