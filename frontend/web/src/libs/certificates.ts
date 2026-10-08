import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { Certificate } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type CertificateInput = {
  name: string;
  bankId?: string | null;
  accountId: string;
  principal: number;
  annualRatePct: number;
  payoutFrequency: 'weekly' | 'monthly' | 'yearly';
  payoutAmount: number;
  startDate: string;
  maturityDate?: string | null;
  categoryId?: string | null;
  notes?: string | null;
};

/**
 * Deposit certificates with recurring interest income. Creation/editing goes
 * through the `upsertCertificate` callable so the linked recurring income
 * rule stays in step; the list reads the household collection directly.
 */
export const certificatesLib = {
  async list(householdId: string): Promise<Certificate[]> {
    const items = await dbLib.getDocs(householdId, 'certificates') as Certificate[];
    return items.sort((a, b) => {
      if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  },

  async upsert(input: { householdId: string; action: 'create' | 'edit' | 'redeem'; certificateId?: string; certificate?: CertificateInput }): Promise<string> {
    const callable = httpsCallable<typeof input, { certificateId: string }>(requireFunctions(), 'upsertCertificate');
    return (await callable(input)).data.certificateId;
  },
};
