import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recurringSharedEntriesLib, type RecurringRuleAction, type RecurringRuleInput } from '@/libs/recurringSharedEntries';

export function useRecurringRules(householdId: string) {
  return useQuery({
    queryKey: ['recurringRules', householdId],
    queryFn: () => recurringSharedEntriesLib.getRules(householdId),
    enabled: !!householdId,
  });
}

export function useUpsertRecurringRuleMutation(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: RecurringRuleAction; ruleId?: string; rule?: RecurringRuleInput }) =>
      recurringSharedEntriesLib.upsert({ householdId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules', householdId] });
      // Creating a rule also materializes its first pending entry.
      queryClient.invalidateQueries({ queryKey: ['sharedBalanceEntries', householdId] });
    },
  });
}
