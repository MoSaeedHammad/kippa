import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recurringTransactionsLib } from '@/libs/recurringTransactions';

export function useRecurringTransactionRules(householdId: string) {
  return useQuery({
    queryKey: ['recurringTransactionRules', householdId],
    queryFn: () => recurringTransactionsLib.listRules(householdId),
    enabled: !!householdId,
  });
}

export function useRecurringDrafts(householdId: string) {
  return useQuery({
    queryKey: ['recurringDrafts', householdId],
    queryFn: () => recurringTransactionsLib.listDrafts(householdId),
    enabled: !!householdId,
    refetchInterval: 30_000,
  });
}

export function useUpsertRecurringTransactionRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurringTransactionsLib.upsert,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recurringTransactionRules', variables.householdId] });
      queryClient.invalidateQueries({ queryKey: ['recurringDrafts', variables.householdId] });
    },
  });
}

export function useDecideRecurringDraftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, transactionId, action, amount }: { householdId: string; transactionId: string; action: 'confirm' | 'skip'; amount?: number }) =>
      recurringTransactionsLib.decide(householdId, transactionId, action, amount),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recurringDrafts', variables.householdId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.householdId] });
      queryClient.invalidateQueries({ queryKey: ['ledgerLines', variables.householdId] });
    },
  });
}
