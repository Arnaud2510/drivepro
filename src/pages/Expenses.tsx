import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../data/store';
import { newId } from '../data/repository';
import type { Expense, FixedCost, PaymentMethod } from '../domain/types';
import { FIXED_COST_CATEGORIES } from '../config/catalog';
import { useCatalog } from '../data/catalog';
import { Badge, Button, Card, EmptyState, Input, Money, MoneyInput, Notice, PageHeader, Select, Toggle, useMoney } from '../components/ui';
import { useFormat, useToday } from '../components/hooks';
import { isEnergyCategory } from '../domain/types';

function ExpenseForm({ initial, onDone }: { initial: Expense; onDone: () => void }) {
  const { t } = useTranslation();
  const { upsert, data, mode, uploadReceipt } = useStore();
  const { categories } = useCatalog();
  const { currency } = useMoney();
  const f = useFormat();
  const [x, setX] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<Expense>) => setX((v) => ({ ...v, ...p }));
  return (
    <form
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!x.amount || x.amount <= 0) return setErr(t('errors.invalidAmount'));
        await upsert('expenses', x);
        onDone();
      }}
    >
      <Input label={t('common.date')} type="date" value={x.date} onChange={(e) => set({ date: e.target.value })} />
      <Select
        label={t('expenses.category')}
        value={x.category}
        onChange={(e) => set({ category: e.target.value, kind: categories.find((c) => c.id === e.target.value)?.defaultKind ?? x.kind })}
      >
        {categories.map((c) => <option key={c.id} value={c.id}>{f.category(c.id)}</option>)}
      </Select>
      <MoneyInput label={t('expenses.amount')} currency={currency} value={x.amount || null} onChange={(v) => set({ amount: v ?? 0 })} />
      <Select label={t('expenses.kind')} value={x.kind} onChange={(e) => set({ kind: e.target.value as Expense['kind'] })}>
        <option value="daily">{t('expenses.kinds.daily')}</option>
        <option value="occasional">{t('expenses.kinds.occasional')}</option>
      </Select>
      <div className="col-span-2">
        <Input label={t('expenses.description')} value={x.description} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <Select label={t('day.vehicle')} value={x.vehicleId ?? ''} onChange={(e) => set({ vehicleId: e.target.value || null })}>
        <option value="">{t('day.noVehicle')}</option>
        {data.vehicles.filter((v) => !v.archived || v.id === x.vehicleId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </Select>
      <Select label={t('expenses.payment')} value={x.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}>
        {(['cash', 'card', 'mobile_money', 'transfer', 'other'] as const).map((m) => <option key={m} value={m}>{t(`payment.${m}`)}</option>)}
      </Select>
      <div className="col-span-2 sm:col-span-4">
        {mode === 'supabase' ? (
          <Input
            label={t('expenses.receipt')}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            disabled={uploading}
            hint={x.receiptPath ? t('expenses.receiptAttached') : t('expenses.receiptHint')}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) return setErr(t('errors.fileTooLarge'));
              setUploading(true);
              try {
                set({ receiptPath: await uploadReceipt(file) });
              } catch {
                setErr(t('errors.uploadFailed'));
              } finally {
                setUploading(false);
              }
            }}
          />
        ) : (
          <p className="text-xs text-slate-500">{t('expenses.receiptNeedsAccount')}</p>
        )}
      </div>
      {isEnergyCategory(x.category) && <div className="col-span-2 sm:col-span-4"><Notice>{t('expenses.energyNotice')}</Notice></div>}
      {err && <div className="col-span-2 sm:col-span-4"><Notice tone="loss">{err}</Notice></div>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <Button type="submit" loading={uploading}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

function FixedCostForm({ initial, onDone }: { initial: FixedCost; onDone: () => void }) {
  const { t } = useTranslation();
  const { upsert, data } = useStore();
  const { currency } = useMoney();
  const [x, setX] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<FixedCost>) => setX((v) => ({ ...v, ...p }));
  return (
    <form
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!x.label.trim() || !x.monthlyAmount) return setErr(t('errors.required'));
        if (x.endDate && x.endDate < x.startDate) return setErr(t('errors.endBeforeStart'));
        await upsert('fixedCosts', x);
        onDone();
      }}
    >
      <Input label={t('fixed.label')} value={x.label} onChange={(e) => set({ label: e.target.value })} />
      <Select label={t('expenses.category')} value={x.category} onChange={(e) => set({ category: e.target.value })}>
        {FIXED_COST_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fixedCategories.${c}`)}</option>)}
      </Select>
      <MoneyInput label={t('fixed.monthly')} currency={currency} value={x.monthlyAmount || null} onChange={(v) => set({ monthlyAmount: v ?? 0 })} />
      <Select label={t('day.vehicle')} value={x.vehicleId ?? ''} onChange={(e) => set({ vehicleId: e.target.value || null })}>
        <option value="">{t('fixed.allActivity')}</option>
        {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </Select>
      <Input label={t('fixed.start')} type="date" value={x.startDate} onChange={(e) => set({ startDate: e.target.value })} />
      <Input label={t('fixed.end')} type="date" value={x.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} />
      {err && <div className="col-span-2 sm:col-span-4"><Notice tone="loss">{err}</Notice></div>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <Button type="submit">{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function Expenses() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data, remove, profile } = useStore();
  const { categories } = useCatalog();
  const today = useToday();
  const f = useFormat();
  const [tab, setTab] = useState<'expenses' | 'fixed'>(params.get('tab') === 'fixed' ? 'fixed' : 'expenses');
  const blankExpense = (): Expense => ({ id: newId(), date: today, category: 'fuel', amount: 0, description: '', vehicleId: data.vehicles.find((v) => !v.archived)?.id ?? null, paymentMethod: 'cash', kind: 'daily', receiptPath: null });
  const [editing, setEditing] = useState<Expense | null>(params.get('new') ? blankExpense() : null);
  const [editingFixed, setEditingFixed] = useState<FixedCost | null>(null);
  const [cat, setCat] = useState('');
  const list = [...data.expenses].filter((e) => !cat || e.category === cat).sort((a, b) => b.date.localeCompare(a.date));
  const totalFixed = data.fixedCosts.filter((c) => !c.endDate || c.endDate >= today).reduce((a, c) => a + c.monthlyAmount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        actions={
          tab === 'expenses' ? (
            <Button onClick={() => setEditing(blankExpense())}><Plus className="h-4 w-4" aria-hidden /> {t('expenses.add')}</Button>
          ) : (
            <Button onClick={() => setEditingFixed({ id: newId(), label: '', category: 'insurance', monthlyAmount: 0, vehicleId: null, startDate: today.slice(0, 8) + '01', endDate: null })}>
              <Plus className="h-4 w-4" aria-hidden /> {t('fixed.add')}
            </Button>
          )
        }
      />
      <Toggle
        label={t('expenses.title')}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setParams(v === 'fixed' ? { tab: 'fixed' } : {});
        }}
        options={[
          { value: 'expenses', label: t('expenses.tabExpenses') },
          { value: 'fixed', label: t('expenses.tabFixed') },
        ]}
      />

      {tab === 'expenses' ? (
        <>
          {editing && (
            <Card title={data.expenses.some((e) => e.id === editing.id) ? t('expenses.edit') : t('expenses.add')}>
              <ExpenseForm initial={editing} onDone={() => { setEditing(null); setParams({}); }} />
            </Card>
          )}
          <div className="max-w-xs">
            <Select label={t('common.filter')} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{t('common.allCategories')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{f.category(c.id)}</option>)}
            </Select>
          </div>
          {list.length === 0 ? (
            <EmptyState title={t('expenses.empty')} />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {list.slice(0, 300).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {f.category(x.category)} {x.receiptPath && <Paperclip className="inline h-3.5 w-3.5 text-slate-400" aria-label={t('expenses.receiptAttached')} />}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {f.date(x.date)} · {t(`expenses.kinds.${x.kind}`)} {x.description && `· ${x.description}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Money value={x.amount} className="font-semibold" />
                      <Button variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(x)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" aria-label={t('common.delete')} onClick={() => confirm(t('common.confirmDelete')) && remove('expenses', x.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <>
          <Notice>
            {t('fixed.explain', { method: t(`fixedMethod.${profile?.fixedCostMethod ?? 'calendar_day'}`) })}
          </Notice>
          {editingFixed && (
            <Card title={t('fixed.add')}>
              <FixedCostForm initial={editingFixed} onDone={() => setEditingFixed(null)} />
            </Card>
          )}
          {data.fixedCosts.length === 0 ? (
            <EmptyState title={t('fixed.empty')} />
          ) : (
            <Card title={<>{t('fixed.totalMonthly')}: <Money value={totalFixed} /></>}>
              <ul className="divide-y divide-slate-100">
                {data.fixedCosts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.label} <Badge>{t(`fixedCategories.${c.category}`, { defaultValue: c.category })}</Badge></p>
                      <p className="text-xs text-slate-500">
                        {f.vehicleName(c.vehicleId)} · {f.date(c.startDate)} → {c.endDate ? f.date(c.endDate) : t('fixed.ongoing')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold"><Money value={c.monthlyAmount} />/{t('common.monthShort')}</span>
                      <Button variant="ghost" aria-label={t('common.edit')} onClick={() => setEditingFixed(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" aria-label={t('common.delete')} onClick={() => confirm(t('common.confirmDelete')) && remove('fixedCosts', c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
