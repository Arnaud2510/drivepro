import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, CheckCheck, CalendarRange, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { useStore } from '../data/store';
import { useNotifications, useNotificationText } from '../data/notifications';
import { pushApi, type PushState } from '../data/services';
import { supabase } from '../data/supabaseRepo';
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, cx } from '../components/ui';
import { formatDate } from '../lib/dates';

const ICONS = { gain: TrendingUp, warn: AlertTriangle, loss: AlertTriangle, info: Info } as const;

function PushSettings() {
  const { t } = useTranslation();
  const { mode, profile, saveProfile } = useStore();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(profile?.reminderTime ?? '20:00');
  const api = pushApi(mode === 'supabase' ? supabase : null);

  useEffect(() => {
    api.state().then(setState).catch(() => setState('unsupported'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (mode !== 'supabase') return <Notice>{t('notifications.pushNeedsAccount')}</Notice>;
  const act = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(t('notifications.pushFailed', { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t('notifications.pushIntro')}</p>
      <p className="flex items-center gap-2 text-sm">
        {state === 'on' ? <Bell className="h-4 w-4 text-gain" aria-hidden /> : <BellOff className="h-4 w-4 text-slate-400" aria-hidden />}
        <span className="font-medium">{state ? t(`notifications.pushState.${state}`) : '…'}</span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {state === 'off' && (
          <Button loading={busy} onClick={() => act(api.enable)}>
            {t('notifications.enablePush')}
          </Button>
        )}
        {state === 'on' && (
          <Button variant="secondary" loading={busy} onClick={() => act(api.disable)}>
            {t('notifications.disablePush')}
          </Button>
        )}
        <div className="w-36">
          <Input label={t('notifications.reminderTime')} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Button variant="secondary" disabled={!profile || time === profile.reminderTime || !/^\d{2}:\d{2}$/.test(time)} onClick={() => profile && saveProfile({ ...profile, reminderTime: time })}>
          {t('common.save')}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{t('notifications.reminderHint', { tz: profile?.timezone })}</p>
      {error && <Notice tone="loss">{error}</Notice>}
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const { locale } = useStore();
  const { items, unread, markRead, markAllRead } = useNotifications();
  const text = useNotificationText();

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.unread', { count: unread })}
        actions={
          <Button variant="secondary" disabled={!items.some((n) => !n.readAt && !n.transient)} onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" aria-hidden /> {t('notifications.markAllRead')}
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title={t('notifications.empty')} text={t('notifications.emptyText')} />
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const Icon = n.kind.endsWith('Summary') ? CalendarRange : ICONS[(n.tone as keyof typeof ICONS) ?? 'info'] ?? Info;
              const unreadItem = !n.readAt && !n.transient;
              return (
                <li key={n.key} className={cx('flex gap-3 px-4 py-3', unreadItem && 'bg-brand-50/60')}>
                  <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', n.tone === 'gain' ? 'text-gain' : n.tone === 'info' ? 'text-brand-700' : n.tone === 'loss' ? 'text-loss' : 'text-warn')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t(`notifications.kinds.${n.kind}`, { defaultValue: n.kind })}
                      {unreadItem && <Badge tone="info">{t('notifications.new')}</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-800">{text(n)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-400">{n.transient ? t('notifications.now') : formatDate(n.createdAt.slice(0, 10), locale)}</span>
                      {n.kind === 'dailyReminder' && (
                        <Link to="/app/day" className="font-semibold text-brand-700 underline">
                          {t('dashboard.enterToday')}
                        </Link>
                      )}
                      {unreadItem && (
                        <button className="text-brand-700 underline" onClick={() => markRead([n.key])}>
                          {t('notifications.markRead')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card title={t('notifications.pushTitle')}>
        <PushSettings />
      </Card>
      <p className="text-xs text-slate-500">
        {t('notifications.prefsHint')}{' '}
        <Link to="/app/profile" className="underline">
          {t('nav.profile')}
        </Link>
      </p>
    </div>
  );
}
