import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authLib } from '@/libs/auth';
import { sharedBalanceLib } from '@/libs/sharedBalance';
import { useAppContext } from '@/hooks/useAppContext';

export function useSharedBalanceEntries(householdId: string) {
  const { userProfile } = useAppContext();
  return useQuery({
    queryKey: ['sharedBalanceEntries', householdId, userProfile?.uid],
    queryFn: () => sharedBalanceLib.getEntries(householdId),
    enabled: !!householdId && !!userProfile,
  });
}

/** Member list for the counterparty picker — any member may fetch it. */
export function useSharedBalanceMembers(householdId: string) {
  const { userProfile } = useAppContext();
  return useQuery({
    queryKey: ['sharedBalanceMembers', householdId],
    queryFn: () => authLib.listHouseholdMembers(userProfile!.uid, householdId),
    enabled: !!householdId && !!userProfile,
  });
}

function useInvalidateEntries() {
  const queryClient = useQueryClient();
  const { householdId } = useAppContext();
  return () => queryClient.invalidateQueries({ queryKey: ['sharedBalanceEntries', householdId] });
}

export function useProposeSharedBalanceEntryMutation() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: sharedBalanceLib.propose,
    onSuccess: () => invalidate(),
  });
}

export function useDecideSharedBalanceEntryMutation() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: ({ householdId, entryId, action }: { householdId: string; entryId: string; action: 'approve' | 'reject' | 'cancel' }) =>
      sharedBalanceLib.decide(householdId, entryId, action),
    onSuccess: () => invalidate(),
  });
}

export function useEditSharedBalanceEntryMutation() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: sharedBalanceLib.edit,
    onSuccess: () => invalidate(),
  });
}
