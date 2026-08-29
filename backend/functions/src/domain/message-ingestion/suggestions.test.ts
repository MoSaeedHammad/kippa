import { describe, expect, it } from 'vitest';
import type { Account, Card } from '@kippa/domain';
import { pickSuggestions } from './suggestions.js';

const egpRunning: Account = { id: 'bm-egp', householdId: 'h', name: 'Bank Misr EGP', type: 'running', currency: 'EGP', isActive: true, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' };
const egpCash: Account = { id: 'cash', householdId: 'h', name: 'Cash', type: 'cash', currency: 'EGP', isActive: true, sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' };
const egpCredit: Account = { id: 'bm-card-account', householdId: 'h', name: 'Bank Misr Card', type: 'credit', currency: 'EGP', isActive: true, sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' };
const debitCard: Card = { id: 'debit-8616', householdId: 'h', name: 'Debit', kind: 'debit', last4: '8616', parentAccountId: 'bm-egp', bankId: 'bank-misr', currency: 'EGP', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };
const creditCard: Card = { id: 'credit-2508', householdId: 'h', name: 'Card', kind: 'credit', last4: '2508', parentAccountId: 'bm-card-account', bankId: 'bank-misr', currency: 'EGP', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };
const accounts = [egpRunning, egpCash, egpCredit];

describe('pickSuggestions', () => {
  it('suggests the debit card parent for an instant transfer out', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'expense', provider: 'bank-misr', amount: 20000, currency: 'EGP', date: '2026-08-30', description: 'Instant transfer out', accountHintLast4: '7391', accountKind: 'bank',
    })).toMatchObject({ accountId: 'bm-egp' });
  });

  it('maps an ATM withdrawal to the card account with a cash destination', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'transfer', provider: 'bank-misr', amount: 15000, currency: 'EGP', date: '2026-08-25', description: 'ATM cash withdrawal', accountHintLast4: '8616', accountKind: 'bank', destinationKind: 'cash',
    })).toMatchObject({ accountId: 'bm-egp', destinationAccountId: 'cash' });
  });

  it('maps a cash deposit from cash into the card parent account', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'transfer', provider: 'bank-misr', amount: 9800, currency: 'EGP', date: '2026-08-25', description: 'Cash deposit at machine', destinationHintLast4: '8616', accountKind: 'bank', destinationKind: 'bank',
    })).toMatchObject({ accountId: 'cash', destinationAccountId: 'bm-egp' });
  });

  it('flags a USD credit-card charge on an EGP card account for conversion', () => {
    expect(pickSuggestions(accounts, [creditCard], {
      kind: 'expense', provider: 'bank-misr', amount: 5.8, currency: 'USD', date: '2026-08-28', description: 'OPENROUTER, INC', accountHintLast4: '2508', accountKind: 'credit-card',
    })).toMatchObject({ accountId: 'bm-card-account', conversionRequired: true });
  });

  it('does not flag an EGP credit-card charge for conversion', () => {
    expect(pickSuggestions(accounts, [creditCard], {
      kind: 'expense', provider: 'bank-misr', amount: 10, currency: 'EGP', date: '2026-08-27', description: 'WE-Mobile-Pre', accountHintLast4: '2508', accountKind: 'credit-card',
    })).toMatchObject({ accountId: 'bm-card-account', conversionRequired: false });
  });
});
