import type { CurrencyCode, FinanceTransaction, RecurringTransactionRule } from '@kippa/domain';
import { occurrenceEntryId } from '../shared-balance/recurring.js';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type NormalizedRecurringTransactionInput = {
  type: RecurringTransactionRule['type'];
  amount: number;
  accountId: string;
  categoryId: string | null;
  destinationAccountId: string | null;
  destinationAmount: number | null;
  merchant: string | null;
  description: string;
  frequency: RecurringTransactionRule['frequency'];
  anchorDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES: readonly RecurringTransactionRule['frequency'][] = ['weekly', 'monthly', 'yearly'];
const MAX_AMOUNT = 1_000_000_000;

/** Deterministic draft id per occurrence — makes cron reruns idempotent. */
export function recurringTransactionId(ruleId: string, dateIso: string): string {
  return `rc_txn_${occurrenceEntryId(ruleId, dateIso)}`;
}

/** Validates the recurring rule form for an income, expense or transfer rule. */
export function validateRecurringTransactionInput(
  raw: Record<string, unknown>,
  todayIso: string,
): ValidationResult<NormalizedRecurringTransactionInput> {
  const type = raw.type;
  if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
    return { ok: false, error: 'type must be income, expense or transfer.' };
  }
  const amount = raw.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }
  const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : '';
  if (!accountId) return { ok: false, error: 'accountId is required.' };
  let categoryId: string | null = null;
  if (type !== 'transfer' && typeof raw.categoryId === 'string' && raw.categoryId.trim()) {
    categoryId = raw.categoryId.trim();
  }
  let destinationAccountId: string | null = null;
  let destinationAmount: number | null = null;
  if (type === 'transfer') {
    destinationAccountId = typeof raw.destinationAccountId === 'string' ? raw.destinationAccountId.trim() : '';
    if (!destinationAccountId) return { ok: false, error: 'destinationAccountId is required for transfer rules.' };
    if (destinationAccountId === accountId) {
      return { ok: false, error: 'Source and destination accounts must be different.' };
    }
    if (raw.destinationAmount != null) {
      if (typeof raw.destinationAmount !== 'number' || !Number.isFinite(raw.destinationAmount) || raw.destinationAmount <= 0 || raw.destinationAmount > MAX_AMOUNT) {
        return { ok: false, error: 'destinationAmount must be a positive number.' };
      }
      destinationAmount = raw.destinationAmount;
    }
  }
  const merchant = typeof raw.merchant === 'string' && raw.merchant.trim()
    ? raw.merchant.trim().slice(0, 120)
    : null;
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  const frequency = raw.frequency;
  if (typeof frequency !== 'string' || !FREQUENCIES.includes(frequency as RecurringTransactionRule['frequency'])) {
    return { ok: false, error: 'frequency must be weekly, monthly or yearly.' };
  }
  const anchorDate = typeof raw.anchorDate === 'string' && ISO_DATE.test(raw.anchorDate) ? raw.anchorDate : todayIso;
  if (!ISO_DATE.test(anchorDate) || Number.isNaN(new Date(`${anchorDate}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'anchorDate must be a YYYY-MM-DD calendar date.' };
  }
  let endDate: string | null = null;
  if (typeof raw.endDate === 'string' && raw.endDate.trim()) {
    if (!ISO_DATE.test(raw.endDate) || raw.endDate < anchorDate) {
      return { ok: false, error: 'endDate must be a calendar date on or after anchorDate.' };
    }
    endDate = raw.endDate;
  }
  let maxOccurrences: number | null = null;
  if (raw.maxOccurrences != null) {
    if (typeof raw.maxOccurrences !== 'number' || !Number.isInteger(raw.maxOccurrences) || raw.maxOccurrences < 1 || raw.maxOccurrences > 1000) {
      return { ok: false, error: 'maxOccurrences must be an integer between 1 and 1000.' };
    }
    maxOccurrences = raw.maxOccurrences;
  }
  return {
    ok: true,
    value: {
      type, amount, accountId, categoryId, destinationAccountId, destinationAmount, merchant,
      description, frequency: frequency as RecurringTransactionRule['frequency'],
      anchorDate, endDate, maxOccurrences,
    },
  };
}

/** Builds the draft transaction for one occurrence; lines are written at confirm time. */
export function buildRecurringDraftTransaction(
  rule: Pick<RecurringTransactionRule, 'id' | 'householdId' | 'type' | 'amount' | 'currency' | 'accountId' | 'categoryId' | 'description' | 'createdBy' | 'merchant'> & {
    destinationAccountId?: string | null;
    destinationAmount?: number | null;
    destinationCurrency?: string | null;
  },
  dateIso: string,
  now: string,
): FinanceTransaction {
  const isTransfer = rule.type === 'transfer';
  return {
    id: recurringTransactionId(rule.id, dateIso),
    householdId: rule.householdId,
    type: rule.type,
    date: dateIso,
    description: rule.description,
    merchant: rule.merchant ?? null,
    categoryId: isTransfer ? null : rule.categoryId,
    budgetCycleId: null,
    createdBy: rule.createdBy,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    recurringRuleId: rule.id,
    recurringDraft: {
      amount: rule.amount,
      currency: rule.currency,
      accountId: rule.accountId,
      categoryId: isTransfer ? null : rule.categoryId,
      merchant: rule.merchant ?? null,
      ...(isTransfer ? {
        destinationAccountId: rule.destinationAccountId ?? null,
        destinationAmount: rule.destinationAmount ?? null,
        destinationCurrency: (rule.destinationCurrency ?? null) as CurrencyCode | null,
      } : {}),
    },
  };
}
