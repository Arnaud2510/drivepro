import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import i18n from '../i18n';
import type { Profile, UserData } from '../domain/types';
import { LocalRepository } from './localRepo';
import { SupabaseRepository, supabase } from './supabaseRepo';
import { emptyData, type EntityKind, type EntityMap, type Repository } from './repository';
import { buildDemoData } from './demo';
export { defaultProfile } from './defaults';
import { normalizeProfile } from './defaults';
import { computeAllDays, type DataSet, type DayResult } from '../lib/finance/engine';

type Mode = 'supabase' | 'local' | 'demo' | null;

interface Store {
  mode: Mode;
  ready: boolean;
  session: Session | null;
  data: UserData;
  profile: Profile | null;
  results: DayResult[];
  dataset: DataSet | null;
  locale: string;
  error: string | null;
  /** Platform administrator (decided server-side). */
  isAdmin: boolean;
  /** Last failed write (shown as a banner); cleared on the next success or dismissal. */
  actionError: string | null;
  clearActionError: () => void;
  startLocal: () => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  upsert: <K extends EntityKind>(kind: K, e: EntityMap[K]) => Promise<void>;
  remove: (kind: EntityKind, id: string) => Promise<void>;
  uploadReceipt: (f: File) => Promise<string | null>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const MODE_KEY = 'drivepro:mode';

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(null);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<UserData>(emptyData());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Runs a write; failures are surfaced to the user and re-thrown so forms stay open. */
  const guarded = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      const r = await fn();
      setActionError(null);
      return r;
    } catch (e) {
      setActionError((e as Error).message || String(e));
      throw e;
    }
  }, []);

  const load = useCallback(async (r: Repository) => {
    try {
      setError(null);
      const d = await r.loadAll();
      if (d.profile) d.profile = normalizeProfile(d.profile);
      setData(d);
      if (d.profile) await i18n.changeLanguage(d.profile.language);
      if (r.mode === 'supabase' && supabase) {
        const { data: admin } = await supabase.rpc('is_admin');
        setIsAdmin(!!admin);
      } else setIsAdmin(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Restore session on startup
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const saved = localStorage.getItem(MODE_KEY) as Mode;
      if (supabase) {
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          const r = new SupabaseRepository(supabase, s.session.user.id);
          setSession(s.session);
          setRepo(r);
          setMode('supabase');
          await load(r);
        }
        const sub = supabase.auth.onAuthStateChange(async (event, sess) => {
          setSession(sess);
          if (event === 'SIGNED_IN' && sess) {
            const r = new SupabaseRepository(supabase!, sess.user.id);
            localStorage.removeItem(MODE_KEY);
            setRepo(r);
            setMode('supabase');
            await load(r);
          }
          if (event === 'SIGNED_OUT') {
            setRepo(null);
            setMode(null);
            setData(emptyData());
          }
        });
        unsub = () => sub.data.subscription.unsubscribe();
      }
      if (!supabase || !(await supabase.auth.getSession()).data.session) {
        if (saved === 'local' || saved === 'demo') {
          const r = new LocalRepository(saved);
          setRepo(r);
          setMode(saved);
          await load(r);
        }
      }
      setReady(true);
    })();
    return () => unsub?.();
  }, [load]);

  const startLocal = useCallback(async () => {
    const r = new LocalRepository('local');
    localStorage.setItem(MODE_KEY, 'local');
    setRepo(r);
    setMode('local');
    await load(r);
  }, [load]);

  const startDemo = useCallback(async () => {
    LocalRepository.seed('demo', buildDemoData(i18n.language));
    const r = new LocalRepository('demo');
    localStorage.setItem(MODE_KEY, 'demo');
    setRepo(r);
    setMode('demo');
    await load(r);
  }, [load]);

  const signOut = useCallback(async () => {
    if (mode === 'supabase') await supabase?.auth.signOut();
    if (mode === 'demo') await repo?.deleteAll();
    localStorage.removeItem(MODE_KEY);
    setRepo(null);
    setMode(null);
    setData(emptyData());
  }, [mode, repo]);

  const saveProfile = useCallback(
    async (p: Profile) => {
      if (!repo) return;
      await guarded(() => repo.saveProfile(p));
      setData((d) => ({ ...d, profile: p }));
      if (i18n.language !== p.language) await i18n.changeLanguage(p.language);
    },
    [repo, guarded],
  );

  const upsert = useCallback(
    async <K extends EntityKind>(kind: K, e: EntityMap[K]) => {
      if (!repo) return;
      await guarded(() => repo.upsert(kind, e));
      setData((d) => {
        const list = d[kind] as unknown as EntityMap[K][];
        const i = list.findIndex((x) => x.id === e.id);
        const next = i >= 0 ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
        return { ...d, [kind]: next };
      });
    },
    [repo, guarded],
  );

  const remove = useCallback(
    async (kind: EntityKind, id: string) => {
      if (!repo) return;
      await guarded(() => repo.remove(kind, id));
      setData((d) => ({ ...d, [kind]: (d[kind] as { id: string }[]).filter((x) => x.id !== id) }));
    },
    [repo, guarded],
  );

  const deleteAccount = useCallback(async () => {
    await repo?.deleteAll();
    await signOut();
  }, [repo, signOut]);

  const profile = data.profile;
  const dataset = useMemo<DataSet | null>(
    () =>
      profile
        ? {
            profile,
            vehicles: data.vehicles,
            platforms: data.platforms,
            days: data.days,
            expenses: data.expenses,
            fixedCosts: data.fixedCosts,
          }
        : null,
    [profile, data],
  );
  const results = useMemo(() => (dataset ? computeAllDays(dataset) : []), [dataset]);
  const locale = profile ? `${profile.language}-${profile.countryCode}` : i18n.language;

  const value: Store = {
    mode,
    ready,
    session,
    data,
    profile,
    results,
    dataset,
    locale,
    error,
    isAdmin,
    actionError,
    clearActionError: () => setActionError(null),
    startLocal,
    startDemo,
    signOut,
    saveProfile,
    upsert,
    remove,
    uploadReceipt: async (f) => (repo ? repo.uploadReceipt(f) : null),
    deleteAccount,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppProvider');
  return s;
}
