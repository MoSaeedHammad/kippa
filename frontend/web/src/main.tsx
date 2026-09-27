import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import App from '@/App';

import { AppProvider } from '@/contexts/AppContext';
import { ThemeModeProvider } from '@/hooks/ThemeModeProvider';
import { PrivacyModeProvider } from '@/hooks/PrivacyModeProvider';
import { versionDetails } from '@/version';

console.info(`[kippa] ${versionDetails.split('\n').join(' · ')}`);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ThemeModeProvider>
          <PrivacyModeProvider>
            <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
              <App />
            </SnackbarProvider>
          </PrivacyModeProvider>
        </ThemeModeProvider>
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

