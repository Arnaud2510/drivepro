import type { Expense, FixedCost, Profile, UserData, UserPlatform, Vehicle, WorkDay } from '../domain/types';

export interface EntityMap {
  vehicles: Vehicle;
  platforms: UserPlatform;
  days: WorkDay;
  expenses: Expense;
  fixedCosts: FixedCost;
}
export type EntityKind = keyof EntityMap;

/** Storage abstraction: Supabase (production) or browser-local (no account / demo). */
export interface Repository {
  readonly mode: 'supabase' | 'local' | 'demo';
  loadAll(): Promise<UserData>;
  saveProfile(p: Profile): Promise<Profile>;
  upsert<K extends EntityKind>(kind: K, entity: EntityMap[K]): Promise<EntityMap[K]>;
  remove(kind: EntityKind, id: string): Promise<void>;
  /** Uploads a receipt and returns its storage path, or null when storage is unavailable. */
  uploadReceipt(file: File): Promise<string | null>;
  deleteAll(): Promise<void>;
}

export const emptyData = (): UserData => ({ profile: null, vehicles: [], platforms: [], days: [], expenses: [], fixedCosts: [] });

export const newId = () => crypto.randomUUID();
