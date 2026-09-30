import { Suspense } from 'react';
import { Box, CircularProgress, Container } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type appShellEn from '@/i18n/locales/en/appShell.json';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TopBar } from '@/components/app-shell/TopBar';
import { BottomNav } from '@/components/app-shell/BottomNav';
import { SideNav } from '@/components/app-shell/SideNav';
import { useAppContext } from '@/hooks/useAppContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useThemeMode } from '@/hooks/useThemeMode';
import { useLoanReminders } from '@/features/loans/useLoanReminders';

type PageTitleKey = keyof typeof appShellEn['pageTitles'];

const PAGE_TITLES: Record<string, PageTitleKey> = {
  '/': 'dashboard',
  '/entry': 'addTransaction',
  '/reconciliation': 'reconciliation',
  '/cycles': 'statements',
  '/transactions': 'transactions',
  '/pending': 'approvals',
  '/shared-balance': 'sharedBalance',
  '/activity': 'activityLog',
  '/accounts': 'bankAccounts',
  '/household': 'mySpace',
  '/categories': 'categories',
  '/notifications': 'notifications',
  '/ai': 'kip',
  '/loans': 'loans',
};

export function AppShell() {
  const { t } = useTranslation('appShell');
  const { userProfile, householdId, userHouseholds, switchHousehold, logout } = useAppContext();
  const isOnline = useOnlineStatus();
  const { modePref, setModePref, resolvedMode } = useThemeMode();
  const { pathname } = useLocation();

  const logoSrc = resolvedMode === 'dark' ? '/icons/icon-dark.svg' : '/icons/icon.svg';
  const pageTitleKey = PAGE_TITLES[pathname];
  useLoanReminders();

  return (
    <>
      <title>{pageTitleKey ? t('documentTitle', { page: t(`pageTitles.${pageTitleKey}`) }) : 'Kippa'}</title>
      <Box sx={{ position: 'relative', zIndex: 1, minHeight: '100dvh', pb: pathname === '/ai' ? 0 : { xs: 10, md: 0 }, bgcolor: 'transparent', overflowX: 'clip' }}>
        <OfflineBanner isOnline={isOnline} />
        <SideNav />
        <Box component="main" sx={{ ms: { md: '264px' }, minHeight: '100dvh', bgcolor: 'background.paper', overflowX: 'clip' }}>
          <TopBar
            logoSrc={logoSrc}
            modePref={modePref}
            setModePref={setModePref}
            userProfile={userProfile}
            householdId={householdId}
            userHouseholds={userHouseholds}
            switchHousehold={switchHousehold}
            logout={logout}
          />
          <Container
            maxWidth={pathname === '/ai' ? false : 'lg'}
            sx={{
              py: pathname === '/ai' ? 0 : { xs: 2, sm: 3 },
              px: pathname === '/ai' ? 0 : { xs: 2, sm: 3 },
              '& > .MuiContainer-root': {
                maxWidth: 'none !important',
                p: '0 !important',
              },
            }}
          >
            <Suspense
              fallback={
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '40vh',
                  }}
                >
                  <CircularProgress color="primary" size={32} thickness={4} />
                </Box>
              }
            >
              <Outlet />
            </Suspense>
          </Container>
        </Box>

        <BottomNav />
      </Box>
    </>
  );
}
