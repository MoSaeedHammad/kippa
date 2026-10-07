import { describe, expect, it } from 'vitest';
import type { Account, Card, PendingFinancialMessage } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';
import { buildMergedTransferLeg } from './transferLegs.js';

const account = (id: string, type: Account['type'], currency: string): Account => ({
  id,
  householdId: 'hh1',
  name: id,
  type,
  currency,
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const card = (last4: string, parentAccountId: string, kind: Card['kind']): Card => ({
  id: `card_${last4}`,
  householdId: 'hh1',
  kind,
  parentAccountId,
  name: `card ${last4}`,
  last4,
  bankId: 'hsbc',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  currency: 'EGP',
});

const leg = (overrides: Partial<ParsedFinancialMessage>): ParsedFinancialMessage => ({
  kind: 'transfer',
  provider: 'hsbc',
  amount: 100,
  currency: 'USD',
  date: '2026-06-01',
  description: 'Phone Banking Transfer',
  accountKind: 'bank',
  transferLeg: 'debit',
  mergeKey: 'phone-banking-transfer',
  ...overrides,
});

const halfPending = (overrides: Partial<PendingFinancialMessage>): PendingFinancialMessage => ({
  id: 'pending_1',
  householdId: 'hh1',
  receivedBy: 'u1',
  kind: 'transfer',
  source: 'sms',
  provider: 'hsbc',
  amount: 5000,
  currency: 'EGP',
  date: '2026-06-01',
  description: 'Phone Banking Transfer',
  messagePreview: 'half leg preview',
  suggestedAccountId: null,
  suggestedDestinationAccountId: null,
  suggestedLoanId: null,
  suggestedLoanName: null,
  suggestedLoanInstallmentNumber: null,
  suggestedCategoryId: null,
  conversionRequired: null,
  destinationAmount: null,
  destinationCurrency: null,
  transferLeg: 'credit',
  mergeKey: 'phone-banking-transfer',
  createdAt: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  ...overrides,
});

describe('buildMergedTransferLeg', () => {
  const accounts = [account('running_egp', 'running', 'EGP'), account('running_usd', 'running', 'USD')];
  const cards = [card('1234', 'running_usd', 'debit')];

  it('merges an arriving debit leg into a pending credit leg', () => {
    const arriving = leg({ transferLeg: 'debit', amount: 100, currency: 'USD', accountHintLast4: '1234' });
    const half = halfPending({ amount: 5000, currency: 'EGP', transferLeg: 'credit' });

    const merged = buildMergedTransferLeg({
      arriving,
      half,
      arrivingPreview: 'debit leg preview',
      accounts,
      cards,
    });

    expect(merged.amount).toBe(100);
    expect(merged.currency).toBe('USD');
    expect(merged.destinationAmount).toBe(5000);
    expect(merged.destinationCurrency).toBe('EGP');
    expect(merged.accountHintLast4).toBe('1234');
    expect(merged.destinationHintLast4).toBeNull();
    expect(merged.transferLeg).toBeNull();
    expect(merged.mergeKey).toBeNull();
    expect(merged.messagePreview).toBe('debit leg preview · half leg preview');
  });

  it('merges an arriving credit leg into a pending debit leg symmetrically', () => {
    const arriving = leg({ transferLeg: 'credit', amount: 5000, currency: 'EGP' });
    const half = halfPending({ amount: 100, currency: 'USD', accountHintLast4: '1234', transferLeg: 'debit' });

    const merged = buildMergedTransferLeg({
      arriving,
      half,
      arrivingPreview: 'credit leg preview',
      accounts,
      cards,
    });

    expect(merged.amount).toBe(100);
    expect(merged.currency).toBe('USD');
    expect(merged.destinationAmount).toBe(5000);
    expect(merged.destinationCurrency).toBe('EGP');
  });

  it('suggests a running account in the credit-leg currency as destination', () => {
    const arriving = leg({ transferLeg: 'credit', amount: 5000, currency: 'EGP' });
    const half = halfPending({ transferLeg: 'debit' });

    const merged = buildMergedTransferLeg({
      arriving,
      half,
      arrivingPreview: 'p',
      accounts,
      cards: [],
    });

    expect(merged.suggestedDestinationAccountId).toBe('running_egp');
  });

  it('suggests the debit account from the debit card hint', () => {
    const arriving = leg({ transferLeg: 'credit', amount: 5000, currency: 'EGP' });
    const half = halfPending({ transferLeg: 'debit', accountHintLast4: '1234' });

    const merged = buildMergedTransferLeg({
      arriving,
      half,
      arrivingPreview: 'p',
      accounts,
      cards,
    });

    expect(merged.suggestedAccountId).toBe('running_usd');
  });
});
