import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';
import { supabase } from './supabaseRepo';
import { localNotifications, supabaseNotifications, type NotificationStore, type StoredNotification } from './services';
import { computeAlerts, computeSummaries, type Alert } from '../lib/alerts';
import { projectMonth } from '../lib/finance/engine';
import { todayIn } from '../lib/dates';
import { formatMoney, formatRate } from '../lib/money';
import { formatDate } from '../lib/dates';

export interface NotificationItem extends StoredNotification {
  transient?: boolean;
}

interface Ctx {
  items: NotificationItem[];
  /** Alerts describing the current state (shown on the dashboard). */
  current: Alert[];
  unread: number;
  markRead: (keys: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsCtx = createContext<Ctx>({ items: [], current: [], unread: 0, markRead: async () => {}, markAllRead: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile, data, results, dataset, mode, session } = useStore();
  const [stored, setStored] = useState<StoredNotification[]>([]);
  const today = profile ? todayIn(profile.timezone) : null;

  // Keyed on the user id: token refreshes replace the session object but not the user.
  const userId = session?.user.id;
  const store: NotificationStore | null = useMemo(() => {
    if (mode === 'supabase' && supabase && userId) return supabaseNotifications(supabase, userId);
    if (mode === 'local' || mode === 'demo') return localNotifications(mode);
    return null;
  }, [mode, userId]);

  const current = useMemo(() => {
    if (!profile || !dataset || !today) return [];
    const projection = projectMonth(dataset, today, 'pace', profile.monthlyGoal);
    return [...computeAlerts(profile, data, results, today, projection), ...computeSummaries(profile, dataset, today)];
  }, [profile, data, results, dataset, today]);

  // Persist new (non-transient) notifications, deduplicated by key.
  const persistKey = current.filter((a) => !a.transient).map((a) => a.key).join('|');
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    store
      .sync(current.filter((a) => !a.transient).map(({ key, kind, tone, params }) => ({ key, kind, tone, params })))
      // A slower, older response must not undo a "mark as read" done meanwhile.
      .then((s) => !cancelled && setStored((prev) => s.map((n) => (n.readAt ? n : { ...n, readAt: prev.find((p) => p.key === n.key)?.readAt ?? null }))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, persistKey]);

  const transient: NotificationItem[] = current
    .filter((a) => a.transient)
    .map((a) => ({ key: a.key, kind: a.kind, tone: a.tone, params: a.params, createdAt: new Date().toISOString(), readAt: null, transient: true }));
  const items = [...transient, ...stored];

  const markRead = useCallback(
    async (keys: string[]) => {
      if (!store) return;
      await store.markRead(keys);
      const now = new Date().toISOString();
      setStored((s) => s.map((n) => (keys.includes(n.key) && !n.readAt ? { ...n, readAt: now } : n)));
    },
    [store],
  );
  const markAllRead = useCallback(() => markRead(stored.filter((n) => !n.readAt).map((n) => n.key)), [markRead, stored]);

  const value = { items, current, unread: stored.filter((n) => !n.readAt).length + transient.length, markRead, markAllRead };
  return <NotificationsCtx.Provider value={value}>{children}</NotificationsCtx.Provider>;
}

export const useNotifications = () => useContext(NotificationsCtx);

/** Renders the localised text of a notification (alerts and summaries). */
export function useNotificationText() {
  const { t } = useTranslation();
  const { profile, locale } = useStore();
  const currency = profile?.currency ?? 'EUR';
  const money = (v: unknown) => (typeof v === 'number' ? formatMoney(v, currency, locale) : '');
  const date = (v: unknown) => (typeof v === 'string' ? formatDate(v, locale) : '');
  return (n: { kind: string; params: Record<string, string | number> }) => {
    const p = n.params ?? {};
    if (n.kind === 'weeklySummary' || n.kind === 'monthlySummary') {
      const base = t(`notifications.${n.kind}`, {
        from: date(p.from),
        to: date(p.to),
        month: typeof p.from === 'string' ? formatDate(p.from, locale, { month: 'long', year: 'numeric' }) : '',
        profit: formatMoney(Number(p.profit) || 0, currency, locale, { sign: true }),
        revenue: money(p.revenue),
        count: Number(p.days) || 0,
        hours: p.hours,
      });
      const extra = [
        Number(p.hours) > 0 ? `${p.hours} h` : null,
        p.perHour != null ? `${formatRate(Number(p.perHour), currency, locale, 0)}/h` : null,
        p.deltaPct != null ? t('notifications.delta', { pct: (Number(p.deltaPct) > 0 ? '+' : '') + p.deltaPct }) : null,
        p.goalPct != null ? t('notifications.goalPct', { pct: p.goalPct }) : null,
      ].filter(Boolean);
      return extra.length ? `${base} ${extra.join(' · ')}` : base;
    }
    return t(`alerts.${n.kind}`, {
      ...p,
      gap: money(p.gap),
      amount: money(p.amount),
      category: p.category ? t(`categories.${p.category}`, { defaultValue: String(p.category) }) : undefined,
      doc: p.doc ? t(`alerts.docs.${p.doc}`) : undefined,
      date: date(p.date),
    });
  };
}
