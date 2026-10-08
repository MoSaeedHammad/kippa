import { describe, expect, it } from 'vitest';
import { buildRecurringDraftTransaction, recurringTransactionId, validateRecurringTransactionInput } from './recurringTransactions.js';

const base = {
  type: 'expense', amount: 1200, accountId: 'acc_bank', categoryId: 'cat_rent',
  description: 'Apartment rent', frequency: 'monthly', anchorDate: '2026-10-01',
  endDate: null, maxOccurrences: null,
};

describe('validateRecurringTransactionInput', () => {
  it('accepts a valid rule', () => {
    const result = validateRecurringTransactionInput(base, '2026-10-02');
    expect(result.ok && result.value.frequency).toBe('monthly');
  });

  it('rejects bad type, amounts, frequency and dates', () => {
    expect(!validateRecurringTransactionInput({ ...base, type: 'adjustment' }, '2026-10-02').ok).toBe(true);
    expect(!validateRecurringTransactionInput({ ...base, amount: 0 }, '2026-10-02').ok).toBe(true);
    expect(!validateRecurringTransactionInput({ ...base, frequency: 'daily' }, '2026-10-02').ok).toBe(true);
    expect(!validateRecurringTransactionInput({ ...base, endDate: '2026-09-01' }, '2026-10-02').ok).toBe(true);
    expect(!validateRecurringTransactionInput({ ...base, maxOccurrences: 0 }, '2026-10-02').ok).toBe(true);
  });

  it('accepts a transfer rule with a destination and rejects a self-transfer', () => {
    const transfer = { ...base, type: 'transfer', categoryId: null, destinationAccountId: 'acc_wallet' };
    const ok = validateRecurringTransactionInput(transfer, '2026-10-02');
    expect(ok.ok && ok.value.destinationAccountId).toBe('acc_wallet');
    expect(ok.ok && ok.value.categoryId).toBeNull();
    expect(!validateRecurringTransactionInput({ ...transfer, destinationAccountId: 'acc_bank' }, '2026-10-02').ok).toBe(true);
    expect(!validateRecurringTransactionInput({ ...base, type: 'transfer', destinationAccountId: '' }, '2026-10-02').ok).toBe(true);
  });

  it('captures an optional merchant', () => {
    const result = validateRecurringTransactionInput({ ...base, merchant: '  Landlord  ' }, '2026-10-02');
    expect(result.ok && result.value.merchant).toBe('Landlord');
  });

  it('allows missing category and defaults the anchor to today', () => {
    const result = validateRecurringTransactionInput({ ...base, categoryId: undefined, anchorDate: undefined }, '2026-10-02');
    expect(result.ok && result.value.categoryId).toBeNull();
    expect(result.ok && result.value.anchorDate).toBe('2026-10-02');
  });
});

describe('buildRecurringDraftTransaction', () => {
  it('embeds the recurring facts and stays a draft', () => {
    const rule = { id: 'r1', householdId: 'hh', createdBy: 'u1', ...base } as const;
    const draft = buildRecurringDraftTransaction(rule, '2026-11-01', 'now');
    expect(draft.status).toBe('draft');
    expect(draft.recurringRuleId).toBe('r1');
    expect(draft.recurringDraft?.amount).toBe(1200);
    expect(draft.id).toBe(recurringTransactionId('r1', '2026-11-01'));
    expect(draft.id.startsWith('rc_txn_sb_rc_')).toBe(true);
  });

  it('embeds transfer destination facts and drops the category', () => {
    const rule = {
      id: 'r2', householdId: 'hh', createdBy: 'u1', type: 'transfer' as const, amount: 500,
      currency: 'EGP', accountId: 'acc_bank', categoryId: 'cat_should_be_ignored',
      destinationAccountId: 'acc_wallet', destinationAmount: null, destinationCurrency: 'EGP',
      description: 'Top up wallet', frequency: 'monthly' as const, anchorDate: '2026-10-01',
    };
    const draft = buildRecurringDraftTransaction(rule, '2026-11-01', 'now');
    expect(draft.type).toBe('transfer');
    expect(draft.categoryId).toBeNull();
    expect(draft.recurringDraft?.destinationAccountId).toBe('acc_wallet');
    expect(draft.recurringDraft?.destinationCurrency).toBe('EGP');
  });
});
