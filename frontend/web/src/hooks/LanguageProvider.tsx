import React, { useCallback, useEffect, useState } from 'react';
import {
  LanguageContext,
  LANGUAGE_DIRECTIONS,
  readBrowserLanguage,
  readStoredLanguage,
  storeLanguage,
  type AppDirection,
  type AppLanguage,
} from '@/contexts/languageContext';
import i18n from '@/i18n';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    return readStoredLanguage() ?? readBrowserLanguage() ?? 'en';
  });

  useEffect(() => {
    void i18n.changeLanguage(language);
    const dir = LANGUAGE_DIRECTIONS[language];
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language]);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    storeLanguage(lang);
  }, []);

  const direction: AppDirection = LANGUAGE_DIRECTIONS[language];

  const value = React.useMemo(
    () => ({ language, direction, setLanguage }),
    [language, direction, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
