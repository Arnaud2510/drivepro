import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Calculator, Globe2, ShieldCheck, Smartphone } from 'lucide-react';
import { formatMoney } from '../../lib/money';

/** Hero mock-up uses the reference test scenario (section 23), labelled as an example. */
function MockDashboard() {
  const { t, i18n } = useTranslation();
  const f = (v: number) => formatMoney(v, 'EUR', i18n.language);
  const rows: [string, number][] = [
    ['dashboard.commissions', 3000],
    ['categories.fuel', 2040],
    ['categories.food', 1000],
    ['categories.cleaning', 500],
    ['landing.mock.fixedAndMaintenance', 1500],
  ];
  return (
    <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-left shadow-2xl ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('landing.mock.today')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t('dashboard.revenue')}</p>
          <p className="text-xl font-bold tabular text-brand-900">{f(15000)}</p>
        </div>
        <div className="rounded-2xl bg-gain-bg p-3">
          <p className="text-xs text-gain">{t('dashboard.profit')}</p>
          <p className="text-xl font-bold tabular text-gain">+{f(6960)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t('dashboard.distance')}</p>
          <p className="text-lg font-bold tabular text-brand-900">200 km</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t('dashboard.perHour')}</p>
          <p className="text-lg font-bold tabular text-brand-900">{formatMoney(696, 'EUR', i18n.language)}/h</p>
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-brand-900">{t('dashboard.whereMoneyGoes')}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between">
            <span className="text-slate-600">{t(k)}</span>
            <span className="tabular font-medium text-loss">−{f(v)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-slate-400">{t('landing.mock.disclaimer')}</p>
    </div>
  );
}

export function Landing() {
  const { t } = useTranslation();
  const pillars = [
    { icon: Calculator, k: 'landing.p1' },
    { icon: Globe2, k: 'landing.p2' },
    { icon: Smartphone, k: 'landing.p3' },
    { icon: ShieldCheck, k: 'landing.p4' },
  ];
  return (
    <>
      <section className="bg-gradient-to-b from-brand-950 to-brand-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{t('landing.badge')}</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">{t('landing.title')}</h1>
            <p className="mt-4 max-w-xl text-lg text-brand-100">{t('landing.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-brand-900 hover:bg-brand-50">
                {t('public.cta.start')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/login" state={{ demo: true }} className="inline-flex min-h-12 items-center rounded-xl px-5 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                {t('landing.tryDemo')}
              </Link>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <MockDashboard />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-brand-900">{t('landing.questionsTitle')}</h2>
        <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
          {['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((q) => (
            <li key={q} className="rounded-2xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-200">
              « {t(`landing.${q}`)} »
            </li>
          ))}
        </ul>
      </section>
      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, k }) => (
            <div key={k} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <Icon className="h-7 w-7 text-brand-700" aria-hidden />
              <h3 className="mt-3 font-semibold text-brand-900">{t(`${k}.title`)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(`${k}.text`)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-3xl font-bold text-brand-900">{t('landing.finalTitle')}</h2>
        <p className="mt-3 text-slate-600">{t('landing.finalText')}</p>
        <Link to="/signup" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-900 px-6 font-semibold text-white hover:bg-brand-800">
          {t('public.cta.start')} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </>
  );
}
