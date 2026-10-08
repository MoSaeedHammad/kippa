import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { FinanceTransaction, RecurringTransactionRule } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export type RecurringRulePayload = {
  householdId: string;
  action: 'create' | 'edit' | 'pause' | 'resume' | 'cancel';
  ruleId?: string;
  type?: 'income' | 'expense' | 'transfer';
  amount?: number;
  accountId?: string;
  categoryId?: string | null;
  destinationAccountId?: string | null;
  destinationAmount?: number | null;
  merchant?: string | null;
  description?: string;
  frequency?: RecurringFrequency;
  anchorDate?: string;
  endDate?: string | null;
};

/** Recurring income/expense/transfer rules + their draft occurrences. */
export const recurringTransactionsLib = {
  async listRules(householdId: string): Promise<RecurringTransactionRule[]> {
    const items = await dbLib.getDocs(householdId, 'recurringTransactionRules') as RecurringTransactionRule[];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  async upsert(data: RecurringRulePayload): Promise<string> {
    const callable = httpsCallable<typeof data, { ruleId: string }>(requireFunctions(), 'upsertRecurringTransactionRule');
    return (await callable(data)).data.ruleId;
  },

  async listDrafts(householdId: string): Promise<FinanceTransaction[]> {
    const items = await dbLib.getDocs(householdId, 'transactions', [
      { field: 'status', op: '==', value: 'draft' },
    ]) as FinanceTransaction[];
    return items.filter((item) => item.recurringRuleId && item.recurringDraft);
  },

  async decide(householdId: string, transactionId: string, action: 'confirm' | 'skip', amount?: number): Promise<string> {
    const callable = httpsCallable<
      { householdId: string; transactionId: string; action: 'confirm' | 'skip'; amount?: number },
      { status: string }
    >(requireFunctions(), 'confirmRecurringTransaction');
    return (await callable({ householdId, transactionId, action, ...(action === 'confirm' && amount != null ? { amount } : {}) })).data.status;
  },
};
