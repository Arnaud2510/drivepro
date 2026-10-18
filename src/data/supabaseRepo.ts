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

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient, private userId: string) {}

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  async loadAll(): Promise<UserData> {
    const q = (t: string) => this.sb.from(t).select('*').eq('user_id', this.userId);
    const [profile, vehicles, platforms, days, earnings, expenses, fixedCosts] = await Promise.all([
      this.sb.from('user_profiles').select('*').eq('id', this.userId).maybeSingle(),
      q('vehicles'),
      q('user_platforms'),
      q('work_sessions').order('date'),
      q('platform_earnings'),
      q('expenses').order('date'),
      q('monthly_fixed_costs'),
    ]);
    const earningRows = this.check(earnings) as Record<string, unknown>[];
    const bySession = new Map<string, Earning[]>();
    for (const r of earningRows) {
      const sid = r.work_session_id as string;
      bySession.set(sid, [...(bySession.get(sid) ?? []), fromRow<Earning>(r)]);
    }
    const p = this.check(profile) as Record<string, unknown> | null;
    return {
      profile: p ? fromRow<Profile>(p) : null,
      vehicles: (this.check(vehicles) as Record<string, unknown>[]).map((r) => fromRow(r)),
      platforms: (this.check(platforms) as Record<string, unknown>[]).map((r) => fromRow(r)),
      days: (this.check(days) as Record<string, unknown>[]).map((r) => ({ ...fromRow<WorkDay>(r), earnings: bySession.get(r.id as string) ?? [] })),
      expenses: (this.check(expenses) as Record<string, unknown>[]).map((r) => fromRow(r)),
      fixedCosts: (this.check(fixedCosts) as Record<string, unknown>[]).map((r) => fromRow(r)),
    };
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
