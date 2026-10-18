// Supabase Edge Function (Deno): sends the daily entry reminder as a Web Push notification.
// Scheduled every hour (see docs/NOTIFICATIONS.md). Uses the service role, server-side only.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.46.2';
import webpush from 'npm:web-push@3.6.7';
import { isReminderDue, localClock, reminderKey, reminderMessage } from '../_shared/reminders.ts';

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('forbidden', { status: 403 });
  }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

  const now = new Date();
  const { data: subs, error } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failures');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];
  if (!userIds.length) return Response.json({ sent: 0 });

  const { data: profiles } = await sb
    .from('user_profiles')
    .select('id, timezone, reminder_time, language, notification_prefs, onboarded')
    .in('id', userIds);

  let sent = 0;
  let removed = 0;
  for (const p of profiles ?? []) {
    if (!p.onboarded) continue;
    const due = isReminderDue(
      { timezone: p.timezone, reminderTime: p.reminder_time, dailyReminderEnabled: p.notification_prefs?.dailyReminder !== false },
      now,
    );
    if (!due) continue;
    const { date } = localClock(now, p.timezone);
    const { count } = await sb.from('work_sessions').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('date', date);
    if (count) continue; // day already entered

    // The unique (user_id, dedupe_key) index makes the job idempotent if it runs twice.
    const msg = reminderMessage(p.language);
    const { error: dupe } = await sb.from('notifications').insert({
      user_id: p.id, kind: 'dailyReminder', dedupe_key: reminderKey(date), channel: 'push', tone: 'info', payload: { date },
    });
    if (dupe) continue;

    for (const s of (subs ?? []).filter((x) => x.user_id === p.id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: msg.title, body: msg.body, url: '/app/day' }),
          { TTL: 3600 },
        );
        sent++;
        await sb.from('push_subscriptions').update({ last_success_at: now.toISOString(), failures: 0 }).eq('id', s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', s.id); // device unsubscribed
          removed++;
        } else {
          console.error('push failed', s.id, status ?? '', (e as Error).message);
          await sb.from('push_subscriptions').update({ failures: s.failures + 1 }).eq('id', s.id);
        }
      }
    }
  }
  return Response.json({ sent, removed });
});
