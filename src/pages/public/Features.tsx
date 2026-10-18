import { useTranslation } from 'react-i18next';
import { CalendarPlus, Calculator, Car, Layers, BarChart3, FileText, Globe2, Users, Bell, Scale } from 'lucide-react';
import { Badge } from '../../components/ui';

const FEATURES = [
  { icon: CalendarPlus, k: 'day', status: 'ready' },
  { icon: Calculator, k: 'engine', status: 'ready' },
  { icon: Car, k: 'vehicles', status: 'ready' },
  { icon: Layers, k: 'platforms', status: 'ready' },
  { icon: BarChart3, k: 'stats', status: 'ready' },
  { icon: Scale, k: 'compare', status: 'ready' },
  { icon: FileText, k: 'reports', status: 'ready' },
  { icon: Globe2, k: 'international', status: 'ready' },
  { icon: Bell, k: 'alerts', status: 'partial' },
  { icon: Users, k: 'fleet', status: 'dev' },
] as const;

export function Features() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-center text-4xl font-extrabold text-brand-900">{t('features.title')}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">{t('features.subtitle')}</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, k, status }) => (
          <article key={k} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <Icon className="h-7 w-7 text-brand-700" aria-hidden />
              <Badge tone={status === 'ready' ? 'gain' : 'warn'}>{t(`features.status.${status}`)}</Badge>
            </div>
            <h2 className="mt-3 font-semibold text-brand-900">{t(`features.items.${k}.title`)}</h2>
            <p className="mt-1 text-sm text-slate-600">{t(`features.items.${k}.text`)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
