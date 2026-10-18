import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo, APP_NAME } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cx } from './ui';
import { PreviewBanner } from './Layout';

export function PublicLayout() {
  const { t } = useTranslation();
  const link = ({ isActive }: { isActive: boolean }) => cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'text-brand-900' : 'text-slate-600 hover:text-brand-900');
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PreviewBanner />
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.main')}>
            <NavLink to="/features" className={link}>
              {t('public.nav.features')}
            </NavLink>
            <NavLink to="/pricing" className={link}>
              {t('public.nav.pricing')}
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-brand-900 hover:bg-slate-100 sm:inline-flex">
              {t('auth.signIn')}
            </Link>
            <Link to="/signup" className="rounded-xl bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
              {t('public.cta.start')}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-slate-500">
          <span>
            © {new Date().getFullYear()} {APP_NAME}
          </span>
          <nav className="flex flex-wrap gap-4">
            <Link to="/features">{t('public.nav.features')}</Link>
            <Link to="/pricing">{t('public.nav.pricing')}</Link>
            <Link to="/privacy">{t('public.nav.privacy')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
