import { useMemo, lazy, Suspense } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { Box, ThemeProvider, CssBaseline } from '@mui/material';
import { createAppTheme } from '@kippa/design-system';
import { useThemeMode } from '@/hooks/useThemeMode';
import { AppBackground } from '@/features/shared/components/AppBackground';
import { useAppContext } from '@/hooks/useAppContext';
import { AppLoadingScreen } from '@/components/app-shell/AppLoadingScreen';
import { AppShell } from '@/components/app-shell/AppShell';
import { useNotifications } from '@/notifications/useNotifications';

const AuthScreen = lazy(() => import('@/features/auth/AuthScreen').then(m => ({ default: m.AuthScreen })));
const Dashboard = lazy(() => import('@/features/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const FastEntry = lazy(() => import('@/features/fast-entry/FastEntry').then(m => ({ default: m.FastEntry })));
const Reconciliation = lazy(() => import('@/features/reconciliation/Reconciliation').then(m => ({ default: m.Reconciliation })));
const BudgetCycles = lazy(() => import('@/features/budget-cycles/BudgetCycles').then(m => ({ default: m.BudgetCycles })));
const Accounts = lazy(() => import('@/features/accounts/Accounts').then(m => ({ default: m.Accounts })));
const Household = lazy(() => import('@/features/household/Household').then(m => ({ default: m.Household })));
const Categories = lazy(() => import('@/features/categories/Categories').then(m => ({ default: m.Categories })));
const Notifications = lazy(() => import('@/features/notifications/Notifications').then(m => ({ default: m.Notifications })));
const TransactionHistory = lazy(() => import('@/features/transactions/TransactionHistory').then(m => ({ default: m.TransactionHistory })));
const AuditLog = lazy(() => import('@/features/activity/AuditLog').then(m => ({ default: m.AuditLog })));
const PendingTransactions = lazy(() => import('@/features/pending-transactions/PendingTransactions').then(m => ({ default: m.PendingTransactions })));
const AiAssistant = lazy(() => import('@/features/ai/AiAssistant').then(m => ({ default: m.AiAssistant })));
const Loans = lazy(() => import('@/features/loans/Loans').then(m => ({ default: m.Loans })));


export default function App() {
  const { userProfile, householdId, isAuthLoading } = useAppContext();
  const { resolvedMode } = useThemeMode();
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  // Register FCM push notifications once the user has a household. Side-effect
  // only — this instance handles the logout-unregister and re-register-on-reload
  // paths. It does NOT auto-prompt (iOS requires a user gesture for that);
  // the Notifications settings page owns the prompt via its own instance.
  useNotifications(householdId);

  if (isAuthLoading) return <AppLoadingScreen theme={theme} />;

  if (!userProfile || !householdId) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppBackground />
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Suspense fallback={<AppLoadingScreen theme={theme} />}>
            <AuthScreen />
          </Suspense>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBackground />
      <BrowserRouter>
        <Suspense fallback={<AppLoadingScreen theme={theme} />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="entry" element={<FastEntry />} />
              <Route path="reconciliation" element={<Reconciliation />} />
              <Route path="cycles" element={<BudgetCycles />} />
              <Route path="transactions" element={<TransactionHistory />} />
              <Route path="pending" element={<PendingTransactions />} />
              <Route path="activity" element={<AuditLog />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="household" element={<Household />} />
              <Route path="categories" element={<Categories />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="ai" element={<AiAssistant />} />
              <Route path="loans" element={<Loans />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
