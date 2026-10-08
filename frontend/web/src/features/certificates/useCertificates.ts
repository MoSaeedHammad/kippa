import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { certificatesLib, type CertificateInput } from '@/libs/certificates';
import { useAppContext } from '@/hooks/useAppContext';

const certificatesKey = (householdId: string) => ['certificates', householdId] as const;

export function useCertificates(householdId: string) {
  return useQuery({
    queryKey: certificatesKey(householdId),
    queryFn: () => certificatesLib.list(householdId),
    enabled: !!householdId,
  });
}

export function useUpsertCertificateMutation() {
  const queryClient = useQueryClient();
  const { householdId } = useAppContext();
  return useMutation({
    mutationFn: (input: { action: 'create' | 'edit' | 'redeem'; certificateId?: string; certificate?: CertificateInput }) =>
      certificatesLib.upsert({ householdId, ...input }),
    onSuccess: () => {
      if (householdId) {
        queryClient.invalidateQueries({ queryKey: certificatesKey(householdId) });
        // Certificate payouts are recurring rules — keep their manager in sync.
        queryClient.invalidateQueries({ queryKey: ['recurringTransactionRules', householdId] });
      }
    },
  });
}
