import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type AccountWipePreview = {
  transactions: number;
  cards: number;
  recurringRules: string[];
  blockingLoan: { id: string; name: string } | null;
};

/**
 * Destructive account/card lifecycle, executed server-side: wiping an
 * account removes every card, statement, ledger line and transaction tied
 * to it and cancels recurring rules paying into it. Removing a credit card
 * takes its hidden debt-bucket account (and its data) along.
 */
export const accountLifecycleLib = {
  async previewWipe(householdId: string, accountId: string): Promise<AccountWipePreview> {
    const callable = httpsCallable<{ householdId: string; accountId: string }, AccountWipePreview>(requireFunctions(), 'previewAccountWipe');
    return (await callable({ householdId, accountId })).data;
  },

  async wipeAccount(householdId: string, accountId: string): Promise<{ deletedTransactions: number }> {
    const callable = httpsCallable<{ householdId: string; accountId: string }, { deletedTransactions: number }>(requireFunctions(), 'wipeAccount');
    return (await callable({ householdId, accountId })).data;
  },

  async deleteCard(householdId: string, cardId: string): Promise<{ deleted: boolean; wipedAccountId?: string; deletedTransactions?: number }> {
    const callable = httpsCallable<{ householdId: string; cardId: string }, { deleted: boolean; wipedAccountId?: string; deletedTransactions?: number }>(requireFunctions(), 'deleteCard');
    return (await callable({ householdId, cardId })).data;
  },
};
