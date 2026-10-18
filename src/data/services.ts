/**
 * Server features that only exist with a Supabase account: fleet, administration, persisted
 * notifications and push devices. Every access decision is enforced by RLS / SECURITY DEFINER
 * functions in the database — these helpers only call them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserData } from '../domain/types';
import { loadUserData } from './supabaseRepo';

async function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------------ fleet */

export type OrgRole = 'owner' | 'manager' | 'driver';

export interface Membership {
  organizationId: string;
  organizationName: string;
  currency: string | null;
  role: OrgRole;
  sharesData: boolean;
  consentAt: string | null;
}

export interface RosterEntry {
  userId: string;
  email: string;
  displayName: string;
  role: OrgRole;
  sharesData: boolean;
  consentAt: string | null;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: 'driver' | 'manager';
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface InvitePreview {
  status: 'valid' | 'not_found' | 'used' | 'expired' | 'wrong_email';
  organization?: string;
  role?: string;
  email?: string;
}

export function fleetApi(sb: SupabaseClient, userId: string) {
  return {
    async memberships(): Promise<Membership[]> {
      const rows = await run(
        sb.from('organization_members').select('organization_id, role, shares_data, consent_at, organizations(name, currency)').eq('user_id', userId),
      );
      return (rows as unknown as { organization_id: string; role: OrgRole; shares_data: boolean; consent_at: string | null; organizations: { name: string; currency: string | null } }[]).map((r) => ({
        organizationId: r.organization_id,
        organizationName: r.organizations?.name ?? '—',
        currency: r.organizations?.currency ?? null,
        role: r.role,
        sharesData: r.shares_data,
        consentAt: r.consent_at,
      }));
    },
    async createOrganization(name: string, countryCode: string | null, currency: string): Promise<string> {
      const id = crypto.randomUUID();
      await run(sb.from('organizations').insert({ id, name, country_code: countryCode, currency, created_by: userId }));
      await run(sb.from('organization_members').insert({ organization_id: id, user_id: userId, role: 'owner' }));
      return id;
    },
    async roster(orgId: string): Promise<RosterEntry[]> {
      const rows = (await run(sb.rpc('org_roster', { p_org: orgId }))) as Record<string, unknown>[];
      return rows.map((r) => ({
        userId: r.user_id as string,
        email: r.email as string,
        displayName: r.display_name as string,
        role: r.role as OrgRole,
        sharesData: r.shares_data as boolean,
        consentAt: r.consent_at as string | null,
        joinedAt: r.joined_at as string,
      }));
    },
    async invites(orgId: string): Promise<Invite[]> {
      const rows = await run(sb.from('organization_invites').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }));
      return (rows as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        email: r.email as string,
        role: r.role as Invite['role'],
        token: r.token as string,
        createdAt: r.created_at as string,
        expiresAt: r.expires_at as string,
        acceptedAt: r.accepted_at as string | null,
      }));
    },
    async invite(orgId: string, email: string, role: Invite['role']): Promise<string> {
      const row = await run(
        sb.from('organization_invites').insert({ organization_id: orgId, email: email.trim().toLowerCase(), role, created_by: userId }).select('token').single(),
      );
      return (row as { token: string }).token;
    },
    revokeInvite: (id: string) => run(sb.from('organization_invites').delete().eq('id', id)),
    removeMember: (orgId: string, memberId: string) => run(sb.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', memberId)),
    setRole: (orgId: string, memberId: string, role: 'driver' | 'manager') =>
      run(sb.from('organization_members').update({ role }).eq('organization_id', orgId).eq('user_id', memberId)),
    setConsent: (orgId: string, share: boolean) =>
      run(sb.from('organization_members').update({ shares_data: share }).eq('organization_id', orgId).eq('user_id', userId)),
    leave: (orgId: string) => run(sb.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId)),
    preview: async (token: string) => (await run(sb.rpc('invite_preview', { p_token: token }))) as InvitePreview,
    accept: (token: string, share: boolean) => run(sb.rpc('accept_invite', { p_token: token, p_share: share })),
    /** Loads a consenting driver's data; RLS returns nothing for others. */
    driverData: (driverId: string): Promise<UserData> => loadUserData(sb, driverId),
  };
}

/* ------------------------------------------------------------------ notifications */

export interface StoredNotification {
  key: string;
  kind: string;
  tone: string;
  params: Record<string, string | number>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationStore {
  /** Stores new notifications (duplicates ignored) and returns the latest ones with read state. */
  sync(items: { key: string; kind: string; tone: string; params: Record<string, string | number> }[]): Promise<StoredNotification[]>;
  markRead(keys: string[]): Promise<void>;
}

export function supabaseNotifications(sb: SupabaseClient, userId: string): NotificationStore {
  return {
    async sync(items) {
      if (items.length)
        await run(
          sb.from('notifications').upsert(
            items.map((i) => ({ user_id: userId, kind: i.kind, dedupe_key: i.key, tone: i.tone, payload: i.params })),
            { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
          ),
        );
      const rows = await run(sb.from('notifications').select('*').eq('user_id', userId).eq('channel', 'in_app').order('created_at', { ascending: false }).limit(100));
      return (rows as Record<string, unknown>[]).map((r) => ({
        key: r.dedupe_key as string,
        kind: r.kind as string,
        tone: r.tone as string,
        params: (r.payload ?? {}) as Record<string, string | number>,
        createdAt: r.created_at as string,
        readAt: r.read_at as string | null,
      }));
    },
    async markRead(keys) {
      if (keys.length) await run(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).in('dedupe_key', keys).is('read_at', null));
    },
  };
}

/** Browser-only store for the no-account and demo modes. */
export function localNotifications(mode: string): NotificationStore {
  const KEY = `drivepro:${mode}:notifications`;
  const read = (): StoredNotification[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  };
  const write = (v: StoredNotification[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v.slice(0, 100)));
    } catch {
      /* storage unavailable: read state is simply not remembered */
    }
  };
  return {
    async sync(items) {
      const cur = read();
      const known = new Set(cur.map((n) => n.key));
      const now = new Date().toISOString();
      const fresh = items.filter((i) => !known.has(i.key)).map((i) => ({ ...i, createdAt: now, readAt: null }));
      const all = [...fresh, ...cur];
      write(all);
      return all;
    },
    async markRead(keys) {
      const now = new Date().toISOString();
      write(read().map((n) => (keys.includes(n.key) && !n.readAt ? { ...n, readAt: now } : n)));
    },
  };
}

/* ------------------------------------------------------------------ push */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'not_configured' | 'denied' | 'off' | 'on';

function b64ToBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function pushApi(sb: SupabaseClient | null) {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const registration = () => navigator.serviceWorker.register('/sw.js');
  return {
    async state(): Promise<PushState> {
      if (!supported) return 'unsupported';
      if (!VAPID_PUBLIC_KEY || !sb) return 'not_configured';
      if (Notification.permission === 'denied') return 'denied';
      const sub = await (await registration()).pushManager.getSubscription();
      return sub ? 'on' : 'off';
    },
    async enable(): Promise<PushState> {
      if (!supported) return 'unsupported';
      if (!VAPID_PUBLIC_KEY || !sb) return 'not_configured';
      if ((await Notification.requestPermission()) !== 'granted') return 'denied';
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await run(
        sb.from('push_subscriptions').upsert(
          { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
          { onConflict: 'endpoint' },
        ),
      );
      return 'on';
    },
    async disable(): Promise<PushState> {
      if (!supported) return 'unsupported';
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        if (sb) await run(sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint));
        await sub.unsubscribe();
      }
      return 'off';
    },
  };
}

/* ------------------------------------------------------------------ administration */

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  banned: boolean;
  displayName: string;
  countryCode: string | null;
  onboarded: boolean;
  isAdmin: boolean;
  plan: string | null;
  total: number;
}

export function adminApi(sb: SupabaseClient) {
  return {
    isAdmin: async () => !!(await run(sb.rpc('is_admin'))),
    stats: () => run(sb.rpc('admin_stats')) as Promise<Record<string, unknown>>,
    async users(search: string, limit: number, offset: number): Promise<AdminUser[]> {
      const rows = (await run(sb.rpc('admin_list_users', { p_search: search, p_limit: limit, p_offset: offset }))) as Record<string, unknown>[];
      return rows.map((r) => ({
        id: r.id as string,
        email: r.email as string,
        createdAt: r.created_at as string,
        lastSignInAt: r.last_sign_in_at as string | null,
        banned: r.banned as boolean,
        displayName: r.display_name as string,
        countryCode: r.country_code as string | null,
        onboarded: r.onboarded as boolean,
        isAdmin: r.is_admin as boolean,
        plan: r.plan as string | null,
        total: Number(r.total),
      }));
    },
    setAdmin: (id: string, on: boolean) => run(sb.rpc('admin_set_role', { p_user: id, p_admin: on })),
    setSuspended: (id: string, on: boolean) => run(sb.rpc('admin_set_suspended', { p_user: id, p_suspended: on })),
    setPlan: (id: string, plan: string | null) => run(sb.rpc('admin_set_plan', { p_user: id, p_plan: plan })),
    organizations: () => run(sb.rpc('admin_list_organizations')) as Promise<Record<string, unknown>[]>,
    audit: (limit = 100) => run(sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)) as Promise<Record<string, unknown>[]>,
    list: (table: string, order: string) => run(sb.from(table).select('*').order(order).limit(1000)) as Promise<Record<string, unknown>[]>,
    upsert: (table: string, row: Record<string, unknown>, onConflict: string) => run(sb.from(table).upsert(row, { onConflict })),
    remove(table: string, match: Record<string, unknown>) {
      let q = sb.from(table).delete();
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
      return run(q);
    },
  };
}
