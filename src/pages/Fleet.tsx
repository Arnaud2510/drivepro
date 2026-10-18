import { useTranslation } from 'react-i18next';
import { Card, InDevelopment, PageHeader } from '../components/ui';

export function Fleet() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <PageHeader title={t('fleet.title')} subtitle={t('fleet.subtitle')} />
      <InDevelopment>{t('fleet.status')}</InDevelopment>
      <Card title={t('fleet.readyTitle')}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {['r1', 'r2', 'r3'].map((k) => <li key={k}>{t(`fleet.${k}`)}</li>)}
        </ul>
      </Card>
      <Card title={t('fleet.nextTitle')}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {['n1', 'n2', 'n3', 'n4'].map((k) => <li key={k}>{t(`fleet.${k}`)}</li>)}
        </ul>
      </Card>
    </div>
  );
}
