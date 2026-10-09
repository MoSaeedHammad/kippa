import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type {
  DecideImportBatchResult,
  HistoryImportMessage,
  ImportMessageHistoryResult,
  MessageIngestionCredential,
  PendingFinancialMessage,
  ResolvedPendingFinancialMessage,
} from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export const messageIngestionLib = {
  async getPending(householdId: string): Promise<PendingFinancialMessage[]> {
    const items = await dbLib.getDocs(householdId, 'pendingFinancialMessages') as PendingFinancialMessage[];
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async approve(data: {
    householdId: string;
    pendingId: string;
    merchant?: string;
    categoryId?: string;
    accountId: string;
    destinationAccountId?: string;
    convertedAmount?: number;
    /** Optional IOU/split tag creating a pending shared-balance entry on approval. */
    sharedBalanceTag?: { kind: 'iou' | 'split'; counterpartyUid: string; amount?: number };
    /** Optional split of the message amount across several accounts. */
    accountAllocations?: { accountId: string; amount: number }[];
  }): Promise<string> {
    const callable = httpsCallable<typeof data, { transactionId: string }>(requireFunctions(), 'approvePendingFinancialMessage');
    return (await callable(data)).data.transactionId;
  },

  async discard(householdId: string, pendingId: string): Promise<void> {
    const callable = httpsCallable<{ householdId: string; pendingId: string }, { discarded: boolean }>(
      requireFunctions(),
      'discardPendingFinancialMessage',
    );
    await callable({ householdId, pendingId });
  },

  async getResolved(householdId: string): Promise<ResolvedPendingFinancialMessage[]> {
    const callable = httpsCallable<
      { householdId: string },
      { items: ResolvedPendingFinancialMessage[] }
    >(requireFunctions(), 'listResolvedPendingFinancialMessages');
    return (await callable({ householdId })).data.items;
  },

  async restoreDiscarded(householdId: string, pendingId: string): Promise<PendingFinancialMessage> {
    const callable = httpsCallable<
      { householdId: string; pendingId: string },
      { item: PendingFinancialMessage }
    >(requireFunctions(), 'restoreDiscardedPendingFinancialMessage');
    return (await callable({ householdId, pendingId })).data.item;
  },

  async createCredential(householdId: string): Promise<{ credentialId: string; token: string; endpoint: string }> {
    const callable = httpsCallable<
      { householdId: string; label: string },
      { credentialId: string; token: string; endpoint: string }
    >(requireFunctions(), 'createMessageIngestionCredential');
    return (await callable({ householdId, label: 'SMS forwarder' })).data;
  },

  async listCredentials(householdId: string): Promise<MessageIngestionCredential[]> {
    const callable = httpsCallable<
      { householdId: string },
      { credentials: MessageIngestionCredential[] }
    >(requireFunctions(), 'listMessageIngestionCredentials');
    return (await callable({ householdId })).data.credentials;
  },

  async revokeCredential(credentialId: string): Promise<void> {
    const callable = httpsCallable<{ credentialId: string }, { revoked: boolean }>(
      requireFunctions(),
      'revokeMessageIngestionCredential',
    );
    await callable({ credentialId });
  },

  /** Stages one chunk of messages extracted from a phone history export. */
  async importHistory(data: {
    householdId: string;
    messages: HistoryImportMessage[];
    batchId?: string;
    from?: string;
    to?: string;
    source?: string;
  }): Promise<ImportMessageHistoryResult> {
    const callable = httpsCallable<typeof data, ImportMessageHistoryResult>(requireFunctions(), 'importMessageHistory');
    return (await callable(data)).data;
  },

  /** Stages one chunk of structured records from a JSON history export. */
  async importRecords(data: {
    householdId: string;
    records: {
      kind: 'expense' | 'income' | 'transfer';
      date: string;
      amount: number;
      currency: string;
      description?: string;
      merchant?: string;
      accountId?: string;
      destinationAccountId?: string;
      categoryId?: string;
    }[];
    batchId?: string;
    from?: string;
    to?: string;
  }): Promise<ImportMessageHistoryResult> {
    const callable = httpsCallable<typeof data, ImportMessageHistoryResult>(requireFunctions(), 'importRecordHistory');
    return (await callable(data)).data;
  },

  /** Approves or discards a staged history import batch (100 items per call). */
  async decideBatch(data: {
    householdId: string;
    batchId: string;
    action: 'approve' | 'discard';
    maxItems?: number;
    /** Order key of the previous window's last item — continues the batch where it stopped. */
    cursor?: string;
  }): Promise<DecideImportBatchResult> {
    const callable = httpsCallable<typeof data, DecideImportBatchResult>(requireFunctions(), 'decideImportBatch');
    return (await callable(data)).data;
  },
};
