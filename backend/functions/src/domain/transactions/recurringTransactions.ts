import type { FinanceTransaction, RecurringTransactionRule } from '@kippa/domain';
import { occurrenceEntryId } from '../shared-balance/recurring.js';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type NormalizedRecurringTransactionInput = {
  type: 'income' | 'expense';
  amount: number;
  accountId: string;
  categoryId: string | null;
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

/** Validates the FastEntry "repeat" form for a recurring income/expense rule. */
export function validateRecurringTransactionInput(
  raw: Record<string, unknown>,
  todayIso: string,
): ValidationResult<NormalizedRecurringTransactionInput> {
  const type = raw.type;
  if (type !== 'income' && type !== 'expense') return { ok: false, error: 'type must be income or expense.' };
  const amount = raw.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }
  const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : '';
  if (!accountId) return { ok: false, error: 'accountId is required.' };
  let categoryId: string | null = null;
  if (typeof raw.categoryId === 'string' && raw.categoryId.trim()) categoryId = raw.categoryId.trim();
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
    value: { type: type as 'income' | 'expense', amount, accountId, categoryId, description, frequency: frequency as RecurringTransactionRule['frequency'], anchorDate, endDate, maxOccurrences },
  };
}

/** Builds the draft transaction for one occurrence; lines are written at confirm time. */
export function buildRecurringDraftTransaction(
  rule: Pick<RecurringTransactionRule, 'id' | 'householdId' | 'type' | 'amount' | 'currency' | 'accountId' | 'categoryId' | 'description' | 'createdBy'>,
  dateIso: string,
  now: string,
): FinanceTransaction {
  return {
    id: recurringTransactionId(rule.id, dateIso),
    householdId: rule.householdId,
    type: rule.type,
    date: dateIso,
    description: rule.description,
    categoryId: rule.categoryId,
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
      categoryId: rule.categoryId,
    },
  };
}
