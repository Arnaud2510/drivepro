import type { Profile, UserData } from '../domain/types';
import { emptyData, type EntityKind, type EntityMap, type Repository } from './repository';

/**
 * Browser storage repository, used when no Supabase project is configured or when the
 * driver chooses to try the app without an account. Data never leaves the device.
 * The demo namespace is fully separate from the user's own local data.
 */
export class LocalRepository implements Repository {
  constructor(readonly mode: 'local' | 'demo') {}

  private get key() {
    return `drivepro:${this.mode}:v1`;
  }

  private read(): UserData {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? { ...emptyData(), ...JSON.parse(raw) } : emptyData();
    } catch {
      return emptyData();
    }
  }

  private write(d: UserData) {
    localStorage.setItem(this.key, JSON.stringify(d));
  }

  async loadAll() {
    return this.read();
  }

  async saveProfile(p: Profile) {
    const d = this.read();
    d.profile = p;
    this.write(d);
    return p;
  }

  async upsert<K extends EntityKind>(kind: K, entity: EntityMap[K]) {
    const d = this.read();
    const list = d[kind] as unknown as EntityMap[K][];
    const i = list.findIndex((x) => x.id === entity.id);
    if (i >= 0) list[i] = entity;
    else list.push(entity);
    this.write(d);
    return entity;
  }

  async remove(kind: EntityKind, id: string) {
    const d = this.read();
    (d[kind] as { id: string }[]) = (d[kind] as { id: string }[]).filter((x) => x.id !== id);
    this.write(d);
  }

  async uploadReceipt() {
    return null; // Receipts require a connected account (secure storage).
  }

  async deleteAll() {
    localStorage.removeItem(this.key);
  }

  static hasData(mode: 'local' | 'demo') {
    try {
      return !!localStorage.getItem(`drivepro:${mode}:v1`);
    } catch {
      return false;
    }
  }

  static seed(mode: 'demo', data: UserData) {
    localStorage.setItem(`drivepro:${mode}:v1`, JSON.stringify(data));
  }
}
