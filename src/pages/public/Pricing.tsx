import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useCatalog } from '../../data/catalog';
import { Notice, cx } from '../../components/ui';

export function Pricing() {
  const { t } = useTranslation();
  const { plans } = useCatalog();
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-center text-4xl font-extrabold text-brand-900">{t('pricing.title')}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">{t('pricing.subtitle')}</p>
      <div className="mx-auto mt-6 max-w-2xl">
        <Notice>{t('pricing.devNotice')}</Notice>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <article key={p.id} className={cx('flex flex-col rounded-3xl bg-white p-6 ring-1', p.id === 'pro' ? 'ring-2 ring-brand-700' : 'ring-slate-200')}>
            <h2 className="text-xl font-bold text-brand-900">{t(`pricing.plans.${p.id}.name`)}</h2>
            <p className="mt-1 text-sm text-slate-600">{t(`pricing.plans.${p.id}.tagline`)}</p>
            <p className="mt-4 text-2xl font-extrabold text-brand-900">{t(`pricing.plans.${p.id}.price`)}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden />
                  {t(`pricing.features.${f}`, { defaultValue: f })}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-900 font-semibold text-white hover:bg-brand-800">
              {t('public.cta.start')}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
