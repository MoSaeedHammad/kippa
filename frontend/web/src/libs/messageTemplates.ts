import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { MessageTemplate, PendingFinancialMessage } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type MessageTemplateInput = {
  name: string;
  pattern: string;
  kind: 'expense' | 'income' | 'transfer';
  amountGroup: string;
  currencyGroup?: string | null;
  currency?: string | null;
  dateGroup?: string | null;
  dateFormat?: 'dd/MM/yyyy' | 'dd-MM-yyyy' | 'yyyy-MM-dd' | null;
  merchantGroup?: string | null;
  last4Group?: string | null;
  cardKind?: 'debit' | 'credit' | null;
  bankId?: string | null;
  descriptionGroup?: string | null;
  isActive?: boolean;
};

export type TemplateTestMatch = {
  parsed: Pick<PendingFinancialMessage, 'kind' | 'provider' | 'amount' | 'currency' | 'date' | 'description' | 'counterparty' | 'accountHintLast4'>;
  templateId: string;
  templateName: string;
};

/** User-defined regex templates that extract fields from bank messages. */
export const messageTemplatesLib = {
  async list(householdId: string): Promise<MessageTemplate[]> {
    const items = await dbLib.getDocs(householdId, 'messageTemplates') as MessageTemplate[];
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async upsert(input: { householdId: string; action: 'create' | 'edit' | 'remove'; templateId?: string; template?: MessageTemplateInput }): Promise<string> {
    const callable = httpsCallable<typeof input, { templateId: string }>(requireFunctions(), 'upsertMessageTemplate');
    return (await callable(input)).data.templateId;
  },

  /** Runs a draft or saved template against a sample message (server-side regex application). */
  async test(input: { householdId: string; sample: string; template?: MessageTemplateInput; templateId?: string }): Promise<{ matched: boolean; match: TemplateTestMatch | null }> {
    const callable = httpsCallable<typeof input, { matched: boolean; match: TemplateTestMatch | null }>(requireFunctions(), 'testMessageTemplate');
    return (await callable(input)).data;
  },
};
