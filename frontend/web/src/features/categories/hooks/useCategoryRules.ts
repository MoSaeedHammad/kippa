import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryRulesLib } from '@/libs/categoryRules';

export function useCategoryRules(householdId: string) {
  return useQuery({
    queryKey: ['categoryRules', householdId],
    queryFn: () => categoryRulesLib.list(householdId),
    enabled: !!householdId,
  });
}

export function useAddCategoryRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categoryRulesLib.add,
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ['categoryRules', variables.householdId] }),
  });
}

export function useRemoveCategoryRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, ruleId }: { householdId: string; ruleId: string }) => categoryRulesLib.remove(householdId, ruleId),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ['categoryRules', variables.householdId] }),
  });
}
