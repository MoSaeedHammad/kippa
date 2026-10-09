import { describe, expect, it } from 'vitest';
import type { PendingFinancialMessage } from '@kippa/domain';
import { refinedPendingFields, refineIsNoOp } from './batchRefine.js';
import type { ParsedFinancialMessage } from './parser.js';

const parsed = (overrides: Partial<ParsedFinancialMessage>): ParsedFinancialMessage => ({
  kind: 'expense', provider: 'bank-misr', amount: 354, currency: 'EGP', date: '2026-09-12',
  description: 'Card/account debit', accountKind: 'bank', ...overrides,
});

const suggestions = (overrides: Partial<Parameters<typeof refinedPendingFields>[0]['suggestions']> = {}) => ({
  accountId: 'acc1', destinationAccountId: undefined, conversionRequired: false, ...overrides,
});

const fields = (overrides: Partial<Parameters<typeof refinedPendingFields>[0]> = {}) => refinedPendingFields({
  parsed: parsed(),
  suggestions: suggestions(),
  loanSuggestion: null,
  suggestedCategoryId: 'cat1',
  matchedTemplateId: 'tpl1',
  matchedTemplateName: 'BM debit',
  ...overrides,
});

const staged = (overrides: Partial<PendingFinancialMessage>): PendingFinancialMessage => ({
  id: 'p1', householdId: 'h', receivedBy: 'u', kind: 'expense', source: 'import',
  provider: 'bank-misr', amount: 354, currency: 'EGP', date: '2026-09-12',
  description: 'Card/account debit', counterparty: null, messagePreview: 'preview',
  sourceMessage: 'raw message', accountHintLast4: null, destinationHintLast4: null,
  suggestedAccountId: null, suggestedDestinationAccountId: null, suggestedAccountProposal: null,
  matchedTemplateId: null, matchedTemplateName: null, suggestedLoanId: null, suggestedLoanName: null,
  suggestedLoanInstallmentNumber: null, suggestedCategoryId: null, conversionRequired: null,
  destinationAmount: null, destinationCurrency: null, transferLeg: null, mergeKey: null,
  importBatchId: 'his_test0001', importedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z', status: 'pending', ...overrides,
});

describe('refinedPendingFields', () => {
  it('mirrors the ingest-time derivation, template attribution included', () => {
    expect(fields()).toMatchObject({
      kind: 'expense', provider: 'bank-misr', amount: 354, currency: 'EGP',
      suggestedAccountId: 'acc1', matchedTemplateId: 'tpl1', matchedTemplateName: 'BM debit',
      suggestedCategoryId: 'cat1', conversionRequired: null, transferLeg: null, mergeKey: null,
    });
  });

  it('keeps the caller-provided category and refreshes transfer suggestions', () => {
    // Transfers never get a category: the callable passes null, like ingest does.
    const refined = refinedPendingFields({
      parsed: parsed({ kind: 'transfer' }),
      suggestions: suggestions({ accountId: 'acc2', destinationAccountId: 'acc3' }),
      loanSuggestion: null,
      suggestedCategoryId: null,
    });
    expect(refined.kind).toBe('transfer');
    expect(refined.suggestedCategoryId).toBeNull();
    expect(refined.suggestedDestinationAccountId).toBe('acc3');
  });

  it('renames the description after a loan suggestion', () => {
    const refined = refinedPendingFields({
      parsed: parsed(),
      suggestions: suggestions(),
      loanSuggestion: { loanId: 'loan1', loanName: 'Car loan', installmentNumber: 4 },
      suggestedCategoryId: 'cat1',
    });
    expect(refined.description).toBe('Car loan — installment 4');
    expect(refined.suggestedLoanId).toBe('loan1');
  });
});

describe('refineIsNoOp', () => {
  it('is true when the staged doc already carries the refined attributes', () => {
    const existing = staged({
      suggestedAccountId: 'acc1', matchedTemplateId: 'tpl1', matchedTemplateName: 'BM debit', suggestedCategoryId: 'cat1',
    });
    expect(refineIsNoOp(existing, fields())).toBe(true);
  });

  it('is false when a suggestion changes — the doc needs the rewrite', () => {
    const existing = staged({ suggestedAccountId: 'old-account' });
    expect(refineIsNoOp(existing, fields())).toBe(false);
  });

  it('treats missing and null hints as the same', () => {
    const existing = staged({ accountHintLast4: null, suggestedAccountId: 'acc1', matchedTemplateId: 'tpl1', matchedTemplateName: 'BM debit', suggestedCategoryId: 'cat1' });
    expect(refineIsNoOp(existing, fields({ parsed: parsed({ accountHintLast4: undefined }) }))).toBe(true);
  });
});
