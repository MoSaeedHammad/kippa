import { useLanguage } from '@/hooks/useLanguage';
import { arEG, enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const DATE_FNS_LOCALES: Record<string, Locale> = {
  en: enUS,
  ar: arEG,
};

const INTL_LOCALES: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-EG',
};

export function useLocaleInfo() {
  const { language, direction } = useLanguage();
  return {
    language,
    direction,
    dateFnsLocale: DATE_FNS_LOCALES[language],
    intlLocale: INTL_LOCALES[language],
  };
}
