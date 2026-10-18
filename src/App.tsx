import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from './data/store';
import { rememberReturn } from './lib/returnTo';
import { AppLayout, MorePage } from './components/Layout';
import { PublicLayout } from './components/PublicLayout';
import { Landing } from './pages/public/Landing';
import { Features } from './pages/public/Features';
import { Pricing } from './pages/public/Pricing';
import { Privacy } from './pages/public/Privacy';
import { Login, Signup, ResetPassword, UpdatePassword } from './pages/public/Auth';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { DayEntry } from './pages/DayEntry';
import { Vehicles } from './pages/Vehicles';
import { Platforms } from './pages/Platforms';
import { Expenses } from './pages/Expenses';
import { HistoryPage } from './pages/History';
import { CalendarPage } from './pages/Calendar';
import { Stats } from './pages/Stats';
import { Compare } from './pages/Compare';
import { Goals } from './pages/Goals';
import { Reports } from './pages/Reports';
import { Profile } from './pages/Profile';
import { Fleet, JoinFleet } from './pages/Fleet';
import { NotificationsPage } from './pages/Notifications';
import { Admin } from './pages/Admin';

function Guard({ children, onboarding }: { children: ReactNode; onboarding?: boolean }) {
  const { ready, mode, profile } = useStore();
  const loc = useLocation();
  if (!ready)
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-brand-800" />
      </div>
    );
  // Come back to the requested page (e.g. a fleet invitation link) after sign-in / sign-up / onboarding.
  if (!mode) {
    if (loc.pathname !== '/app') rememberReturn(loc.pathname);
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  if (!onboarding && !profile?.onboarded) {
    if (loc.pathname !== '/app') rememberReturn(loc.pathname);
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="features" element={<Features />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="update-password" element={<UpdatePassword />} />
      </Route>
      <Route path="onboarding" element={<Guard onboarding><Onboarding /></Guard>} />
      <Route path="app" element={<Guard><AppLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="day" element={<DayEntry />} />
        <Route path="day/:date" element={<DayEntry />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="stats" element={<Stats />} />
        <Route path="compare" element={<Compare />} />
        <Route path="goals" element={<Goals />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="fleet/join/:token" element={<JoinFleet />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="admin" element={<Admin />} />
        <Route path="more" element={<MorePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
