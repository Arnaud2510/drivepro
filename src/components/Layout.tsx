import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarPlus,
  Receipt,
  History,
  BarChart3,
  User,
  CalendarDays,
  Scale,
  Target,
  FileText,
  Car,
  Layers,
  Users,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useStore } from '../data/store';
import { cx } from './ui';
import { Logo } from './Logo';

const mainNav = [
  { to: '/app', icon: LayoutDashboard, key: 'nav.dashboard', end: true },
  { to: '/app/day', icon: CalendarPlus, key: 'nav.day' },
  { to: '/app/expenses', icon: Receipt, key: 'nav.expenses' },
  { to: '/app/history', icon: History, key: 'nav.history' },
  { to: '/app/stats', icon: BarChart3, key: 'nav.stats' },
  { to: '/app/profile', icon: User, key: 'nav.profile' },
];
const moreNav: { to: string; icon: typeof User; key: string; end?: boolean }[] = [
  { to: '/app/calendar', icon: CalendarDays, key: 'nav.calendar', end: false },
  { to: '/app/compare', icon: Scale, key: 'nav.compare' },
  { to: '/app/goals', icon: Target, key: 'nav.goals' },
  { to: '/app/reports', icon: FileText, key: 'nav.reports' },
  { to: '/app/vehicles', icon: Car, key: 'nav.vehicles' },
  { to: '/app/platforms', icon: Layers, key: 'nav.platforms' },
  { to: '/app/fleet', icon: Users, key: 'nav.fleet' },
  { to: '/app/admin', icon: ShieldCheck, key: 'nav.admin' },
];

export function ModeBanner() {
  const { mode, signOut } = useStore();
  const { t } = useTranslation();
  if (mode === 'demo')
    return (
      <div className="no-print flex flex-wrap items-center justify-center gap-2 bg-warn-bg px-4 py-2 text-center text-sm font-medium text-warn">
        <span>{t('mode.demoBanner')}</span>
        <button onClick={signOut} className="underline">
          {t('mode.leaveDemo')}
        </button>
      </div>
    );
  if (mode === 'local')
    return <div className="no-print bg-brand-50 px-4 py-1.5 text-center text-xs text-brand-800">{t('mode.localBanner')}</div>;
  return null;
}

export function AppLayout() {
  const { t } = useTranslation();
  const { signOut, profile } = useStore();
  return (
    <div className="min-h-dvh">
      <ModeBanner />
      <div className="mx-auto flex max-w-7xl">
        <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:flex">
          <Link to="/app" className="mb-4 px-2">
            <Logo />
          </Link>
          {[...mainNav, ...moreNav].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium', isActive ? 'bg-brand-900 text-white' : 'text-slate-700 hover:bg-slate-100')
              }
            >
              <n.icon className="h-4 w-4" aria-hidden />
              {t(n.key)}
            </NavLink>
          ))}
          <div className="mt-auto border-t border-slate-200 pt-3">
            {profile?.displayName && <p className="truncate px-3 pb-2 text-sm text-slate-500">{profile.displayName}</p>}
            <button onClick={signOut} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-700 hover:bg-slate-100">
              <LogOut className="h-4 w-4" aria-hidden /> {t('nav.signOut')}
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-8">
          <div className="no-print mb-3 flex items-center justify-between lg:hidden">
            <Logo />
            <NavLink to="/app/more" className="rounded-lg px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">
              {t('nav.more')}
            </NavLink>
          </div>
          <Outlet />
        </main>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t('nav.main')}>
        <ul className="grid grid-cols-6">
          {mainNav.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium', isActive ? 'text-brand-900' : 'text-slate-500')}
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('rounded-full px-3 py-1', isActive && 'bg-brand-100')}>
                      <n.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="max-w-full truncate">{t(n.key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function MorePage() {
  const { t } = useTranslation();
  const { signOut } = useStore();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-brand-900">{t('nav.more')}</h1>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {moreNav.map((n) => (
          <li key={n.to}>
            <Link to={n.to} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-medium text-brand-900 shadow-sm ring-1 ring-slate-200">
              <n.icon className="h-6 w-6" aria-hidden />
              {t(n.key)}
            </Link>
          </li>
        ))}
        <li>
          <button onClick={signOut} className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-medium text-loss shadow-sm ring-1 ring-slate-200">
            <LogOut className="h-6 w-6" aria-hidden />
            {t('nav.signOut')}
          </button>
        </li>
      </ul>
    </div>
  );
}
