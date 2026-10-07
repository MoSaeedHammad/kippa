import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ledgerLib } from '@/libs/ledger';
import { cyclesLib } from '@/libs/cycles';
import { transactionsLib } from '@/libs/transactions';
import { loansLib, type LoanInput } from '@/libs/loans';
import { cardsLib, type CardInput } from '@/libs/cards';
import { auditLogLib } from '@/libs/auditLog';
import { messageIngestionLib } from '@/libs/messageIngestion';
import { authLib } from '@/libs/auth';
import { currencyLib } from '@/libs/currency';
import { detectBaseCurrency } from '@/libs/currencyMeta';
import { useAppContext } from '@/hooks/useAppContext';
import { useSnackbar } from 'notistack';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { notifyOfflineAwareSuccess } from '@/lib/offlineToast';
import { computeFrequencyScores } from '@/utils/categoryFrequency';
import { financeQueryKeys as keys } from './financeQueryKeys';
import {
  Account,
  Category,
  BudgetCycle,
  FinanceTransaction,
  LedgerLine,
  BudgetAllocation,
  ExpectedIncome,
  Reconciliation,
  NotificationSettings,
  UserProfile,
  CurrencyCode,
  ConversionDetails,
  AuditLogEntry,
  Card,
  CardStatement,
  Loan,
  PendingFinancialMessage,
  ResolvedPendingFinancialMessage,
} from '@kippa/domain';

/**
 * Builds the audit user context (who performed the action) from the
 * authenticated profile. Returns undefined when no profile is available,
 * which gracefully disables audit logging for that call.
 */
function useAuditUser() {
  const { userProfile } = useAppContext();
  if (!userProfile) return undefined;
  return {
    uid: userProfile.uid,
    displayName: userProfile.displayName,
    photoURL: userProfile.photoURL,
  };
}

/**
 * Shared notifier for mutation onSuccess handlers. When offline, a successful
 * mutation means the Firestore SDK buffered the write locally — surface the
 * "will sync" toast so the user knows it wasn't lost.
 */
function useOfflineSuccessNotifier() {
  const isOnline = useOnlineStatus();
  const { enqueueSnackbar } = useSnackbar();
  return () => notifyOfflineAwareSuccess({ isOnline, enqueue: enqueueSnackbar });
}

// --- Queries ---

export function useAccounts(householdId: string) {
  return useQuery({
    queryKey: keys.accounts(householdId),
    queryFn: () => ledgerLib.getAccounts(householdId),
    enabled: !!householdId,
  });
}

export function useCategories(householdId: string) {
  return useQuery({
    queryKey: keys.categories(householdId),
    queryFn: () => ledgerLib.getCategories(householdId),
    enabled: !!householdId,
  });
}

export function useCycles(householdId: string) {
  return useQuery({
    queryKey: keys.cycles(householdId),
    queryFn: () => cyclesLib.getCycles(householdId),
    enabled: !!householdId,
  });
}

export function useTransactions(householdId: string, cycleId?: string) {
  return useQuery({
    queryKey: keys.transactions(householdId, cycleId),
    queryFn: () => ledgerLib.getTransactions(householdId, cycleId),
    enabled: !!householdId,
  });
}

export function usePendingFinancialMessages(householdId: string) {
  return useQuery({
    queryKey: keys.pendingMessages(householdId),
    queryFn: () => messageIngestionLib.getPending(householdId),
    enabled: !!householdId,
    refetchInterval: 30_000,
  });
}

export function useResolvedPendingFinancialMessages(householdId: string) {
  return useQuery<ResolvedPendingFinancialMessage[]>({
    queryKey: keys.resolvedMessages(householdId),
    queryFn: () => messageIngestionLib.getResolved(householdId),
    enabled: !!householdId,
  });
}

export function useApprovePendingFinancialMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messageIngestionLib.approve,
    onMutate: async (variables) => {
      const queryKey = keys.pendingMessages(variables.householdId);
      await queryClient.cancelQueries({ queryKey });

      const previousPending = queryClient.getQueryData<PendingFinancialMessage[]>(queryKey);
      queryClient.setQueryData<PendingFinancialMessage[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== variables.pendingId)
      );

      return { previousPending, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(context.queryKey, context.previousPending);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.loans(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.resolvedMessages(variables.householdId) });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.pendingMessages(variables.householdId) });
    },
  });
}

export function useDiscardPendingFinancialMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, pendingId }: { householdId: string; pendingId: string }) =>
      messageIngestionLib.discard(householdId, pendingId),
    onMutate: async (variables) => {
      const queryKey = keys.pendingMessages(variables.householdId);
      await queryClient.cancelQueries({ queryKey });

      const previousPending = queryClient.getQueryData<PendingFinancialMessage[]>(queryKey);
      queryClient.setQueryData<PendingFinancialMessage[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== variables.pendingId)
      );

      return { previousPending, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(context.queryKey, context.previousPending);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.pendingMessages(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.resolvedMessages(variables.householdId) });
    },
  });
}

export function useRestoreDiscardedPendingFinancialMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, pendingId }: { householdId: string; pendingId: string }) =>
      messageIngestionLib.restoreDiscarded(householdId, pendingId),
    onSuccess: (item, variables) => {
      queryClient.setQueryData<PendingFinancialMessage[]>(
        keys.pendingMessages(variables.householdId),
        (current = []) => [item, ...current.filter((candidate) => candidate.id !== item.id)],
      );
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.pendingMessages(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.resolvedMessages(variables.householdId) });
    },
  });
}

export function useImportMessageHistoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messageIngestionLib.importHistory,
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.pendingMessages(variables.householdId) });
    },
  });
}

export function useDecideImportBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messageIngestionLib.decideBatch,
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.pendingMessages(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.resolvedMessages(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.loans(variables.householdId) });
    },
  });
}

/**
 * Returns a map of categoryId -> recency+frequency score for the given type,
 * based on transactions in the last 30 days. For sorting category chips
 * in Fast Entry so frequently-used categories appear first.
 */
export function useCategoryFrequency(
  householdId: string,
  type: 'income' | 'expense'
): Record<string, number> {
  const { data: transactions } = useTransactions(householdId);
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return computeFrequencyScores(transactions, type, today);
  }, [transactions, type]);
}

export function useLedgerLines(householdId: string, cycleId?: string) {
  return useQuery({
    queryKey: keys.ledgerLines(householdId, cycleId),
    queryFn: () => ledgerLib.getLedgerLines(householdId, cycleId),
    enabled: !!householdId,
  });
}

export function useActiveCycle(householdId: string) {
  return useQuery({
    queryKey: keys.activeCycle(householdId),
    queryFn: () => cyclesLib.getActiveCycle(householdId),
    enabled: !!householdId,
  });
}

export function useBudgetAllocations(householdId: string, cycleId: string | undefined) {
  return useQuery({
    queryKey: keys.allocations(householdId, cycleId),
    queryFn: () => cyclesLib.getBudgetAllocations(householdId, cycleId!),
    enabled: !!householdId && !!cycleId,
  });
}

export function useExpectedIncomes(householdId: string, cycleId: string | undefined) {
  return useQuery({
    queryKey: keys.expectedIncome(householdId, cycleId),
    queryFn: () => cyclesLib.getExpectedIncomes(householdId, cycleId!),
    enabled: !!householdId && !!cycleId,
  });
}

export function useReconciliationHistory(householdId: string) {
  return useQuery({
    queryKey: keys.reconciliations(householdId),
    queryFn: () => ledgerLib.getReconciliations(householdId),
    enabled: !!householdId,
  });
}

export function useNotificationSettings(householdId: string, userId: string) {
  return useQuery({
    queryKey: ['notificationSettings', householdId, userId],
    queryFn: () => ledgerLib.getNotificationSettings(householdId, userId),
    enabled: !!householdId && !!userId,
  });
}

export function useCards(householdId: string) {
  return useQuery({
    queryKey: keys.cards(householdId),
    queryFn: () => cardsLib.getCards(householdId),
    enabled: !!householdId,
  });
}

export function useCardStatements(householdId: string, cardId?: string) {
  return useQuery({
    queryKey: keys.cardStatements(householdId, cardId),
    queryFn: () => cardsLib.getStatements(householdId, cardId),
    enabled: !!householdId,
  });
}

export function useLoans(householdId: string) {
  return useQuery<Loan[]>({ queryKey: keys.loans(householdId), queryFn: () => loansLib.getLoans(householdId), enabled: !!householdId });
}

/**
 * Fetch live foreign → base rates for the given set of currencies.
 * Returns a map { [foreignCode]: rate }. Base currency is omitted (implicit 1).
 */
export function useDisplayRates(
  baseCurrency: CurrencyCode | undefined,
  foreignCurrencies: CurrencyCode[]
) {
  const key = Array.from(new Set(foreignCurrencies)).sort().join(',');
  return useQuery({
    queryKey: ['displayRates', baseCurrency, key],
    queryFn: () => currencyLib.getRatesToBase(baseCurrency!, foreignCurrencies),
    enabled: !!baseCurrency && foreignCurrencies.length > 0,
    staleTime: 1000 * 60 * 15,
  });
}

/**
 * Resolve the active household's base currency.
 * Falls back to detectBaseCurrency() when the shared account info isn't loaded yet
 * or is missing the field (legacy data).
 */
export function useHouseholdBaseCurrency(): CurrencyCode {
  const { householdId, userHouseholds } = useAppContext();
  const active = userHouseholds.find(h => h.id === householdId);
  return active?.baseCurrency || detectBaseCurrency();
}

export function useHouseholdName(householdId: string) {
  return useQuery({
    queryKey: ['householdName', householdId],
    queryFn: () => ledgerLib.getHouseholdName(householdId),
    enabled: !!householdId,
  });
}

export function useUserHouseholds(userProfile: UserProfile | null) {
  return useQuery({
    queryKey: ['userHouseholds', userProfile?.householdIds],
    queryFn: async () => {
      if (!userProfile?.householdIds) return [];
      return Promise.all(
        userProfile.householdIds.map(async (id) => {
          const info = await ledgerLib.getHouseholdInfo(id);
          return info || {
            id,
            name: `Shared account (${id})`,
            baseCurrency: detectBaseCurrency(),
            createdAt: '',
            createdBy: ''
          };
        })
      );
    },
    enabled: !!userProfile?.householdIds,
  });
}

export function useAuditLog(householdId: string, count: number = 200) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!!householdId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!householdId) return;
    const unsubscribe = auditLogLib.subscribeToLogs(householdId, count, (next) => {
      setEntries(next);
      setIsLoading(false);
      setError(null);
    });
    return () => {
      unsubscribe();
      // Reset when the shared account/count subscription changes so we don't show
      // stale entries from a previous household while the new one loads.
      setEntries([]);
      setIsLoading(true);
    };
  }, [householdId, count]);

  // When no household is selected, derive an empty (non-loading) result rather
  // than calling setState synchronously inside the effect body.
  const activeEntries = householdId ? entries : [];
  const activeLoading = householdId ? isLoading : false;

  return { data: activeEntries, entries: activeEntries, isLoading: activeLoading, error };
}

const LAST_SEEN_KEY_PREFIX = 'finance_activity_last_seen_';

function getLastSeenKey(householdId: string, userId: string) {
  return `${LAST_SEEN_KEY_PREFIX}${householdId}_${userId}`;
}

/**
 * Subscribes to localStorage so last-seen stays in sync across tabs and when
 * the active household/user changes. Uses useSyncExternalStore to avoid the
 * "setState in effect" anti-pattern.
 */
function useLastSeen(householdId: string, userId: string | undefined): [string, (value: string) => void] {
  const { userProfile, updateUserProfile } = useAppContext();
  const key = householdId && userId ? getLastSeenKey(householdId, userId) : null;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!key) return () => {};
      window.addEventListener('storage', onStoreChange);
      return () => window.removeEventListener('storage', onStoreChange);
    },
    [key]
  );

  const getSnapshot = useCallback(() => {
    if (!key) return '';
    return localStorage.getItem(key) || '';
  }, [key]);

  const lastSeen = useSyncExternalStore(subscribe, getSnapshot, () => '');

  // Keep localStorage in sync with userProfile.lastSeenActivities from Firestore
  useEffect(() => {
    if (!key || !householdId || !userProfile?.lastSeenActivities?.[householdId]) return;
    const local = localStorage.getItem(key);
    const profileVal = userProfile.lastSeenActivities[householdId];
    if (profileVal && profileVal > (local || '')) {
      localStorage.setItem(key, profileVal);
      // Dispatch storage event to trigger update in useSyncExternalStore across components/tabs
      window.dispatchEvent(new StorageEvent('storage', { key }));
    }
  }, [key, householdId, userProfile?.lastSeenActivities]);

  const setLastSeen = useCallback((value: string) => {
    if (!key) return;
    localStorage.setItem(key, value);
    // useSyncExternalStore can't observe same-tab writes, so dispatch a
    // synthetic 'storage' event to re-trigger the subscription.
    window.dispatchEvent(new StorageEvent('storage', { key }));

    if (userId && householdId) {
      authLib.updateLastSeenActivity(userId, householdId, value)
        .then((updatedProfile) => {
          if (updatedProfile) {
            updateUserProfile(updatedProfile);
          }
        })
        .catch((err) => {
          console.error('Failed to update last seen activity in firestore:', err);
        });
    }
  }, [key, userId, householdId, updateUserProfile]);

  return [lastSeen, setLastSeen];
}

/**
 * Tracks how many audit entries were created by OTHER household members since
 * the current user last viewed the activity feed. Used to drive the bell badge.
 */
export function useUnreadActivityCount(householdId: string, userId: string | undefined) {
  const { userProfile, householdId: activeHouseholdId } = useAppContext();
  // Shared-balance-only members cannot read the audit log (rules), so the
  // activity bell stays silent for them instead of erroring on subscribe.
  const isScoped = userProfile
    ? (userProfile.memberships?.[activeHouseholdId]?.accessLevel ?? 'full') !== 'full'
    : false;
  const { entries } = useAuditLog(isScoped ? '' : householdId, 200);
  const [lastSeen, setLastSeen] = useLastSeen(householdId, userId);

  const unreadCount = entries.filter(
    (e) => e.userId !== userId && e.createdAt > lastSeen
  ).length;

  const markSeen = useCallback(() => {
    setLastSeen(new Date().toISOString());
  }, [setLastSeen]);

  return { unreadCount, markSeen };
}

// --- Mutations ---

export function useCreateLoanMutation() {
  const queryClient = useQueryClient(); const auditUser = useAuditUser(); const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({ mutationFn: ({ householdId, loan }: { householdId: string; loan: LoanInput }) => loansLib.createLoan(householdId, loan, auditUser), onSuccess: (_, variables) => { notifyOfflineSuccess(); queryClient.invalidateQueries({ queryKey: keys.loans(variables.householdId) }); } });
}

export function useUpdateLoanMutation() {
  const queryClient = useQueryClient(); const auditUser = useAuditUser(); const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({ mutationFn: ({ householdId, loanId, loan }: { householdId: string; loanId: string; loan: LoanInput }) => loansLib.updateLoan(householdId, loanId, loan, auditUser), onSuccess: (_, variables) => { notifyOfflineSuccess(); queryClient.invalidateQueries({ queryKey: keys.loans(variables.householdId) }); } });
}

export function useRecordLoanPaymentMutation() {
  const queryClient = useQueryClient(); const auditUser = useAuditUser(); const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({ mutationFn: ({ householdId, loanId, amount, date, budgetCycleId, userId }: { householdId: string; loanId: string; amount: number; date: string; budgetCycleId?: string | null; userId: string }) => loansLib.recordPayment(householdId, loanId, { amount, date, budgetCycleId }, userId, auditUser), onSuccess: (_, variables) => { notifyOfflineSuccess(); queryClient.invalidateQueries({ queryKey: keys.loans(variables.householdId) }); queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) }); queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) }); } });
}

export function useCreateTransactionMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      transaction: Omit<FinanceTransaction, 'id' | 'householdId' | 'createdAt' | 'updatedAt' | 'status'>;
      lines: Omit<LedgerLine, 'id' | 'householdId' | 'transactionId' | 'createdAt'>[];
      conversionDetails?: Omit<ConversionDetails, 'transactionId'>;
    }) => transactionsLib.createTransaction(data.householdId, data.transaction, data.lines, data.conversionDetails, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
    },
  });
}

export function useVoidTransactionMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; transactionId: string }) =>
      transactionsLib.voidTransaction(data.householdId, data.transactionId, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
    },
  });
}

export function useUpdateTransactionMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      transactionId: string;
      transactionUpdates: Partial<FinanceTransaction>;
      lineUpdates: { accountId: string; signedAmount: number; currency: CurrencyCode };
    }) => transactionsLib.updateTransaction(
      data.householdId,
      data.transactionId,
      data.transactionUpdates,
      data.lineUpdates,
      auditUser
    ),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
    },
  });
}

export function useCreateAccountMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      account: Omit<Account, 'id' | 'householdId' | 'createdAt'>;
    }) => ledgerLib.createAccount(data.householdId, data.account, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.accounts(variables.householdId) });
    },
  });
}

export function useUpdateAccountMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      accountId: string;
      updated: Account;
    }) => ledgerLib.updateAccount(data.householdId, data.accountId, data.updated, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.accounts(variables.householdId) });
    },
  });
}

export function useCreateDebitCardMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; card: CardInput; accounts: Account[] }) =>
      cardsLib.createDebitCard(data.householdId, data.card, data.accounts, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.cards(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.accounts(variables.householdId) });
    },
  });
}

export function useCreateCreditCardMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; card: CardInput; accounts: Account[]; sortOrder: number }) =>
      cardsLib.createCreditCard(data.householdId, data.card, data.accounts, data.sortOrder, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.cards(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.accounts(variables.householdId) });
    },
  });
}

export function useUpdateCardMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; cardId: string; updates: Partial<Card>; accounts: Account[] }) =>
      cardsLib.updateCard(data.householdId, data.cardId, data.updates, data.accounts, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.cards(variables.householdId) });
    },
  });
}

export function useMarkAsPaidMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; statement: CardStatement; card: Card; amount: number }) =>
      cardsLib.markAsPaid(data.householdId, data.statement, data.card, data.amount, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.cardStatements(variables.householdId) });
    },
  });
}

export function usePayCardMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: { householdId: string; card: Card; amount: number; settlesChargeIds?: string[]; settlesDescriptions?: string[]; budgetCycleId?: string | null }) =>
      cardsLib.payCard(data.householdId, data.card, data.amount, auditUser, data.settlesChargeIds, data.budgetCycleId, data.settlesDescriptions),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.transactions(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.ledgerLines(variables.householdId) });
    },
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      category: Omit<Category, 'id' | 'householdId' | 'createdAt'>;
    }) => ledgerLib.createCategory(data.householdId, data.category, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.categories(variables.householdId) });
    },
  });
}

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      categoryId: string;
      updates: Partial<Pick<Category, 'name' | 'isActive'>>;
    }) => ledgerLib.updateCategory(data.householdId, data.categoryId, data.updates, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.categories(variables.householdId) });
    },
  });
}

export function useCreateCycleMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      cycle: Omit<BudgetCycle, 'id' | 'householdId'>;
    }) => cyclesLib.createCycle(data.householdId, data.cycle, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.cycles(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.activeCycle(variables.householdId) });
    },
  });
}

export function useUpdateCycleStatusMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      cycleId: string;
      status: 'planned' | 'open' | 'closed';
      extra?: Partial<BudgetCycle>;
    }) => cyclesLib.updateCycleStatus(data.householdId, data.cycleId, data.status, data.extra, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.cycles(variables.householdId) });
      queryClient.invalidateQueries({ queryKey: keys.activeCycle(variables.householdId) });
    },
  });
}

export function useSaveAllocationMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      allocation: Omit<BudgetAllocation, 'id' | 'householdId'>;
    }) => cyclesLib.saveBudgetAllocation(data.householdId, data.allocation, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.allocations(variables.householdId, variables.allocation.budgetCycleId) });
    },
  });
}

export function useSaveAllocationsBatchMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      cycleId: string;
      allocations: Omit<BudgetAllocation, 'id' | 'householdId'>[];
    }) => cyclesLib.saveBudgetAllocationsBatch(data.householdId, data.allocations, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.allocations(variables.householdId, variables.cycleId) });
    },
  });
}

export function useSaveExpectedIncomeMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      income: Omit<ExpectedIncome, 'id' | 'householdId'>;
    }) => cyclesLib.saveExpectedIncome(data.householdId, data.income, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.expectedIncome(variables.householdId, variables.income.budgetCycleId) });
    },
  });
}

export function useUpdateNotificationSettingsMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      userId: string;
      settings: NotificationSettings;
    }) => ledgerLib.updateNotificationSettings(data.householdId, data.userId, data.settings, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: ['notificationSettings', variables.householdId, variables.userId] });
    },
  });
}

export function useSaveReconciliationMutation() {
  const queryClient = useQueryClient();
  const auditUser = useAuditUser();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      householdId: string;
      reconId: string;
      reconLog: Reconciliation;
    }) => ledgerLib.createReconciliation(data.householdId, data.reconId, data.reconLog, auditUser),
    onSuccess: (_, variables) => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: keys.reconciliations(variables.householdId) });
    },
  });
}

export function useCreateHouseholdMutation() {
  const queryClient = useQueryClient();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      userId: string;
      name: string;
    }) => authLib.createHousehold(data.userId, data.name),
    onSuccess: () => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: ['userHouseholds'] });
    },
  });
}

export function useRequestToJoinHouseholdMutation() {
  const queryClient = useQueryClient();
  const notifyOfflineSuccess = useOfflineSuccessNotifier();
  return useMutation({
    mutationFn: (data: {
      userId: string;
      householdId: string;
    }) => authLib.requestToJoinHousehold(data.userId, data.householdId),
    onSuccess: () => {
      notifyOfflineSuccess();
      queryClient.invalidateQueries({ queryKey: ['userHouseholds'] });
    },
  });
}

export function useAllBudgetAllocations(householdId: string) {
  return useQuery({
    queryKey: ['allBudgetAllocations', householdId],
    queryFn: () => cyclesLib.getAllBudgetAllocations(householdId),
    enabled: !!householdId,
  });
}

export function useAllExpectedIncomes(householdId: string) {
  return useQuery({
    queryKey: ['allExpectedIncomes', householdId],
    queryFn: () => cyclesLib.getAllExpectedIncomes(householdId),
    enabled: !!householdId,
  });
}
