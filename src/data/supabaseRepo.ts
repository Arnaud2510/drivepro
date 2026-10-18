import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Earning, Profile, UserData, WorkDay } from '../domain/types';
import type { EntityKind, EntityMap, Repository } from './repository';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Only the public anon key is used client-side; all access control is enforced by RLS. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = !!supabase;

const TABLES: Record<EntityKind, string> = {
  vehicles: 'vehicles',
  platforms: 'user_platforms',
  days: 'work_sessions',
  expenses: 'expenses',
  fixedCosts: 'monthly_fixed_costs',
};

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(obj: object, userId: string, omit: string[] = []) {
  const row: Record<string, unknown> = { user_id: userId };
  for (const [k, v] of Object.entries(obj)) if (!omit.includes(k)) row[snake(k)] = v;
  return row;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (['user_id', 'created_at', 'updated_at', 'organization_id', 'work_session_id'].includes(k)) continue;
    o[camel(k)] = v;
  }
  return o as T;
}

/** PostgREST caps responses (1000 rows by default on Supabase): read every page. */
async function fetchAll(sb: SupabaseClient, table: string, userId: string, order?: string): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').eq('user_id', userId);
    q = q.order(order ?? 'id').order('id').range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Loads one user's data. Used for the signed-in driver and, through RLS, for drivers who
 * consented to share their data with a fleet manager.
 */
export async function loadUserData(sb: SupabaseClient, userId: string): Promise<UserData> {
  const [profile, vehicles, platforms, days, earnings, expenses, fixedCosts] = await Promise.all([
    sb.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
    fetchAll(sb, 'vehicles', userId),
    fetchAll(sb, 'user_platforms', userId),
    fetchAll(sb, 'work_sessions', userId, 'date'),
    fetchAll(sb, 'platform_earnings', userId),
    fetchAll(sb, 'expenses', userId, 'date'),
    fetchAll(sb, 'monthly_fixed_costs', userId),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  const bySession = new Map<string, Earning[]>();
  for (const r of earnings) {
    const sid = r.work_session_id as string;
    bySession.set(sid, [...(bySession.get(sid) ?? []), fromRow<Earning>(r)]);
  }
  const p = profile.data as Record<string, unknown> | null;
  return {
    profile: p ? fromRow<Profile>(p) : null,
    vehicles: vehicles.map((r) => fromRow(r)),
    platforms: platforms.map((r) => fromRow(r)),
    days: days.map((r) => ({ ...fromRow<WorkDay>(r), earnings: bySession.get(r.id as string) ?? [] })),
    expenses: expenses.map((r) => fromRow(r)),
    fixedCosts: fixedCosts.map((r) => fromRow(r)),
  };
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient, private userId: string) {}

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  async loadAll(): Promise<UserData> {
    return loadUserData(this.sb, this.userId);
  }

  async saveProfile(p: Profile) {
    const row = toRow(p, this.userId);
    delete row.user_id;
    this.check(await this.sb.from('user_profiles').upsert(row));
    return p;
  }

  async upsert<K extends EntityKind>(kind: K, entity: EntityMap[K]) {
    if (kind === 'days') {
      // Session + earnings saved in one transaction by a SECURITY INVOKER function (RLS applies).
      const day = entity as WorkDay;
      const session = toRow(day, this.userId, ['earnings']);
      const earnings = day.earnings.map((e) => toRow(e, this.userId));
      this.check(await this.sb.rpc('save_work_session', { p_session: session, p_earnings: earnings }));
      return entity;
    }
    this.check(await this.sb.from(TABLES[kind]).upsert(toRow(entity, this.userId)));
    return entity;
  }

  async remove(kind: EntityKind, id: string) {
    this.check(await this.sb.from(TABLES[kind]).delete().eq('id', id));
  }

  async uploadReceipt(file: File) {
    const path = `${this.userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    this.check(await this.sb.storage.from('receipts').upload(path, file, { upsert: false }));
    return path;
  }

  async deleteAll() {
    // Server-side function deletes every row owned by the caller, then the auth user.
    this.check(await this.sb.rpc('delete_my_account'));
  }
}
