import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import it from './locales/it.json';

// One JSON file per language; add a language by adding a file and registering it here.
export const resources = { fr, en, es, pt, de, it } as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: Object.fromEntries(Object.entries(resources).map(([k, v]) => [k, { translation: v }])),
    fallbackLng: 'fr',
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'drivepro:lang', caches: ['localStorage'] },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

export default i18n;
