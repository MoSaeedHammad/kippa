import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';
import { readBrowserLanguage, readStoredLanguage } from '@/contexts/languageContext';

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage() ?? readBrowserLanguage() ?? 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
