import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transferApprovalsLib } from '@/libs/transferApprovals';

export function useDraftTransfers(householdId: string) {
  return useQuery({
    queryKey: ['draftTransfers', householdId],
    queryFn: () => transferApprovalsLib.listDrafts(householdId),
    enabled: !!householdId,
    refetchInterval: 30_000,
  });
}

function useInvalidateDrafts() {
  const queryClient = useQueryClient();
  return (householdId: string) => {
    queryClient.invalidateQueries({ queryKey: ['draftTransfers', householdId] });
    queryClient.invalidateQueries({ queryKey: ['transactions', householdId] });
    queryClient.invalidateQueries({ queryKey: ['ledgerLines', householdId] });
    queryClient.invalidateQueries({ queryKey: ['accounts', householdId] });
  };
}

export function useProposeTransferMutation() {
  const invalidate = useInvalidateDrafts();
  return useMutation({
    mutationFn: transferApprovalsLib.propose,
    onSuccess: (_data, variables) => invalidate(variables.householdId),
  });
}

export function useDecideDraftTransferMutation() {
  const invalidate = useInvalidateDrafts();
  return useMutation({
    mutationFn: ({ householdId, transactionId, action }: { householdId: string; transactionId: string; action: 'approve' | 'reject' }) =>
      transferApprovalsLib.decide(householdId, transactionId, action),
    onSuccess: (_data, variables) => invalidate(variables.householdId),
  });
}
