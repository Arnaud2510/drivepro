import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../config/catalog';
import { useStore } from '../data/store';
import type { Lang } from '../domain/types';

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { profile, saveProfile } = useStore();
  const current = i18n.language.slice(0, 2);
  return (
    <label className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-100">
      <Globe className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t('settings.language')}</span>
      <select
        value={current}
        onChange={async (e) => {
          const lang = e.target.value as Lang;
          await i18n.changeLanguage(lang);
          if (profile) await saveProfile({ ...profile, language: lang });
        }}
        className="cursor-pointer bg-transparent text-sm font-medium focus:outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {compact ? l.code.toUpperCase() : l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
