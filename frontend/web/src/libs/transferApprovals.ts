import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { FinanceTransaction } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type TransferProposalResult = {
  status: 'posted' | 'pending';
  transactionId: string;
  requiredApprovals?: string[];
};

export const transferApprovalsLib = {
  /**
   * Proposes an account-to-account transfer. Posts immediately when the
   * initiator is the only owner involved; otherwise creates a draft that the
   * other account owners approve in the Approvals page.
   */
  async propose(data: {
    householdId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    destinationAmount?: number | null;
    date: string;
    description: string;
  }): Promise<TransferProposalResult> {
    const callable = httpsCallable<typeof data, TransferProposalResult>(requireFunctions(), 'proposeTransfer');
    return (await callable(data)).data;
  },

  async decide(householdId: string, transactionId: string, action: 'approve' | 'reject'): Promise<{ status: string; remaining: string[] }> {
    const callable = httpsCallable<
      { householdId: string; transactionId: string; action: 'approve' | 'reject' },
      { status: string; remaining: string[] }
    >(requireFunctions(), 'decideDraftTransfer');
    return (await callable({ householdId, transactionId, action })).data;
  },

  /** Draft transfers awaiting owner approvals. */
  async listDrafts(householdId: string): Promise<FinanceTransaction[]> {
    const items = await dbLib.getDocs(householdId, 'transactions', [
      { field: 'status', op: '==', value: 'draft' },
    ]) as FinanceTransaction[];
    return items.filter((item) => item.type === 'transfer' && item.transferDraft);
  },
};
