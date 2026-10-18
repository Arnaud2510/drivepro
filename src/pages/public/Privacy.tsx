import { useTranslation } from 'react-i18next';
import { Notice } from '../../components/ui';

export function Privacy() {
  const { t } = useTranslation();
  const sections = ['data', 'purpose', 'access', 'rights', 'retention'];
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold text-brand-900">{t('privacy.title')}</h1>
      <div className="mt-4">
        <Notice tone="warn">{t('privacy.draft')}</Notice>
      </div>
      {sections.map((s) => (
        <section key={s} className="mt-6">
          <h2 className="text-lg font-semibold text-brand-900">{t(`privacy.${s}.title`)}</h2>
          <p className="mt-1 text-slate-700">{t(`privacy.${s}.text`)}</p>
        </section>
      ))}
    </div>
  );
}
