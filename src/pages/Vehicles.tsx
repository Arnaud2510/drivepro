import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Car, Pencil, Plus, Archive } from 'lucide-react';
import { useStore } from '../data/store';
import { newId } from '../data/repository';
import type { Financing, FuelType, Vehicle, VehicleType } from '../domain/types';
import { FUEL_TYPES, VEHICLE_TYPES } from '../config/catalog';
import { Badge, Button, Card, EmptyState, Input, Money, MoneyInput, NumberInput, PageHeader, Select, useMoney } from '../components/ui';
import { compareVehicles } from '../lib/finance/engine';
import { useFormat } from '../components/hooks';

const blank = (): Vehicle => ({
  id: newId(), name: '', make: '', model: '', year: null, type: 'car', fuelType: 'petrol', consumption: null, energyPrice: null,
  tankCapacity: null, odometer: null, purchasePrice: null, financing: 'owned', maintenanceIntervalKm: null, lastMaintenanceKm: null,
  insuranceExpiry: null, documentsExpiry: null, notes: '', archived: false,
});

export function VehicleForm({ initial, onDone }: { initial: Vehicle; onDone: () => void }) {
  const { t } = useTranslation();
  const { upsert } = useStore();
  const { currency } = useMoney();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Vehicle>) => setV((x) => ({ ...x, ...p }));
  const ev = v.fuelType === 'electric';
  const twoWheels = v.type === 'moto' || v.type === 'scooter';
  return (
    <form
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.name.trim()) return setError(t('errors.required'));
        await upsert('vehicles', { ...v, name: v.name.trim() });
        onDone();
      }}
    >
      <div className="col-span-2">
        <Input label={t('vehicles.name')} value={v.name} error={error} placeholder={t('vehicles.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <Select label={t('vehicles.type')} value={v.type} onChange={(e) => set({ type: e.target.value as VehicleType })}>
        {VEHICLE_TYPES.map((x) => <option key={x} value={x}>{t(`vehicleTypes.${x}`)}</option>)}
      </Select>
      <Select label={t('vehicles.fuelType')} value={v.fuelType} onChange={(e) => set({ fuelType: e.target.value as FuelType })}>
        {FUEL_TYPES.map((x) => <option key={x} value={x}>{t(`fuelTypes.${x}`)}</option>)}
      </Select>
      <Input label={t('vehicles.make')} value={v.make} onChange={(e) => set({ make: e.target.value })} />
      <Input label={t('vehicles.model')} value={v.model} onChange={(e) => set({ model: e.target.value })} />
      <NumberInput label={t('vehicles.year')} value={v.year} min={1950} max={2100} onChange={(x) => set({ year: x })} />
      <NumberInput label={t('vehicles.odometer')} suffix="km" value={v.odometer} onChange={(x) => set({ odometer: x })} />
      <NumberInput label={t('vehicles.consumption')} suffix={ev ? 'kWh/100 km' : 'L/100 km'} value={v.consumption} onChange={(x) => set({ consumption: x })} hint={twoWheels ? t('vehicles.twoWheelsHint') : undefined} />
      <NumberInput label={ev ? t('vehicles.kwhPrice') : t('vehicles.fuelPrice')} suffix={`${currency}/${ev ? 'kWh' : 'L'}`} value={v.energyPrice} onChange={(x) => set({ energyPrice: x })} hint={t('vehicles.priceHint')} />
      {!ev && <NumberInput label={t('vehicles.tank')} suffix="L" value={v.tankCapacity} onChange={(x) => set({ tankCapacity: x })} />}
      <Select label={t('vehicles.financing')} value={v.financing} onChange={(e) => set({ financing: e.target.value as Financing })}>
        {(['owned', 'loan', 'lease', 'rental', 'other'] as const).map((x) => <option key={x} value={x}>{t(`financing.${x}`)}</option>)}
      </Select>
      <MoneyInput label={t('vehicles.purchasePrice')} currency={currency} value={v.purchasePrice} onChange={(x) => set({ purchasePrice: x })} />
      <NumberInput label={t('vehicles.maintenanceInterval')} suffix="km" value={v.maintenanceIntervalKm} onChange={(x) => set({ maintenanceIntervalKm: x })} />
      <NumberInput label={t('vehicles.lastMaintenance')} suffix="km" value={v.lastMaintenanceKm} onChange={(x) => set({ lastMaintenanceKm: x })} />
      <Input label={t('vehicles.insuranceExpiry')} type="date" value={v.insuranceExpiry ?? ''} onChange={(e) => set({ insuranceExpiry: e.target.value || null })} />
      <Input label={t('vehicles.documentsExpiry')} type="date" value={v.documentsExpiry ?? ''} onChange={(e) => set({ documentsExpiry: e.target.value || null })} />
      <div className="col-span-2 sm:col-span-4">
        <Input label={t('common.notes')} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">{t('vehicles.fixedCostsHint')}</p>
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <Button type="submit">{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function Vehicles() {
  const { t } = useTranslation();
  const { data, results, upsert, profile } = useStore();
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const f = useFormat();
  const perf = new Map(compareVehicles(results, profile?.currency ?? 'EUR').map((r) => [r.key, r]));
  const list = data.vehicles.filter((v) => showArchived || !v.archived);
  const monthlyFixed = (id: string) => data.fixedCosts.filter((c) => c.vehicleId === id && !c.endDate).reduce((a, c) => a + c.monthlyAmount, 0);

  return (
    <div className="space-y-5">
      <PageHeader title={t('vehicles.title')} subtitle={t('vehicles.subtitle')} actions={<Button onClick={() => setEditing(blank())}><Plus className="h-4 w-4" aria-hidden /> {t('vehicles.add')}</Button>} />
      {editing && (
        <Card title={data.vehicles.some((v) => v.id === editing.id) ? t('vehicles.edit') : t('vehicles.add')}>
          <VehicleForm initial={editing} onDone={() => setEditing(null)} />
        </Card>
      )}
      {list.length === 0 && !editing ? (
        <EmptyState icon={<Car className="h-8 w-8" />} title={t('vehicles.empty')} action={<Button onClick={() => setEditing(blank())}>{t('vehicles.add')}</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((v) => {
            const p = perf.get(v.id);
            return (
              <Card
                key={v.id}
                title={<span className="flex items-center gap-2">{v.name} {v.archived && <Badge>{t('common.archived')}</Badge>}</span>}
                action={
                  <div className="flex gap-1">
                    <Button variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" aria-label={v.archived ? t('common.restore') : t('common.archive')} onClick={() => upsert('vehicles', { ...v, archived: !v.archived })}><Archive className="h-4 w-4" /></Button>
                  </div>
                }
              >
                <p className="text-sm text-slate-600">
                  {t(`vehicleTypes.${v.type}`)} · {t(`fuelTypes.${v.fuelType}`)} {v.make && `· ${v.make} ${v.model}`} {v.year && `· ${v.year}`}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-slate-500">{t('vehicles.consumption')}</dt>
                  <dd>{v.consumption != null ? `${v.consumption} ${v.fuelType === 'electric' ? 'kWh' : 'L'}/100 km` : '—'}</dd>
                  <dt className="text-slate-500">{t('vehicles.odometer')}</dt>
                  <dd>{f.km(v.odometer)}</dd>
                  <dt className="text-slate-500">{t('vehicles.monthlyFixed')}</dt>
                  <dd><Money value={monthlyFixed(v.id)} /></dd>
                  {p && (
                    <>
                      <dt className="text-slate-500">{t('dashboard.profit')} ({t('common.allTime')})</dt>
                      <dd><Money value={p.profit} sign colored /></dd>
                      <dt className="text-slate-500">{t('dashboard.perKm')}</dt>
                      <dd>{f.perKm(p.profitPerKm)}</dd>
                    </>
                  )}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
      {data.vehicles.some((v) => v.archived) && (
        <Button variant="ghost" onClick={() => setShowArchived((s) => !s)}>{showArchived ? t('common.hideArchived') : t('common.showArchived')}</Button>
      )}
    </div>
  );
}
