import { beforeEach, describe, it, expect, vi } from 'vitest';
import { cardsLib, validateCardInput, computeStatementStatus } from './cards';
import type { CardStatement, Account } from '@kippa/domain';

vi.mock('@/libs/db', () => ({ dbLib: { executeBatch: vi.fn(), getDocs: vi.fn() } }));
vi.mock('@/libs/transactions', () => ({ transactionsLib: { createTransaction: vi.fn() } }));

import { dbLib } from '@/libs/db';
import { transactionsLib } from '@/libs/transactions';

const runningAcc = (id: string, currency: 'EGP' | 'USD' = 'EGP'): Account => ({
  id, householdId: 'h', name: id, type: 'running', currency, isActive: true, sortOrder: 1, createdAt: '',
});
const creditAcc = (id: string): Account => ({
  id, householdId: 'h', name: id, type: 'credit', currency: 'EGP', isActive: true, sortOrder: 2, createdAt: '',
});

const card = {
  id: 'card', householdId: 'h', name: 'ChatGPT', kind: 'credit' as const,
  bankId: 'hsbc', parentAccountId: 'credit', paymentAccountId: 'cash', currency: 'EGP' as const,
  isActive: true, createdAt: '',
};

describe('validateCardInput', () => {
  it('rejects a card with no bankId', () => {
    expect(() => validateCardInput(
      { kind: 'debit', bankId: '', parentAccountId: 'a', name: 'X', currency: 'EGP', isActive: true } as any,
      [runningAcc('a')]
    )).toThrow(/bankId/i);
  });

  it('rejects a card with no parentAccountId', () => {
    expect(() => validateCardInput(
      { kind: 'debit', bankId: 'hsbc', parentAccountId: '', name: 'X', currency: 'EGP', isActive: true } as any,
      [runningAcc('a')]
    )).toThrow(/parentAccountId/i);
  });

  it('rejects a debit card whose parent is not running/savings', () => {
    expect(() => validateCardInput(
      { kind: 'debit', bankId: 'hsbc', parentAccountId: 'c', name: 'X', currency: 'EGP', isActive: true } as any,
      [runningAcc('a'), creditAcc('c')]
    )).toThrow(/running|savings/i);
  });

  it('rejects a credit card whose parent is not a credit account', () => {
    expect(() => validateCardInput(
      { kind: 'credit', bankId: 'hsbc', parentAccountId: 'a', name: 'X', currency: 'EGP', creditLimit: 10000, paymentAccountId: 'a', isActive: true } as any,
      [runningAcc('a')]
    )).toThrow(/credit/i);
  });

  it('rejects a credit card whose currency != paymentAccountId currency', () => {
    expect(() => validateCardInput(
      { kind: 'credit', bankId: 'hsbc', parentAccountId: 'c', name: 'X', currency: 'EGP', creditLimit: 10000, paymentAccountId: 'u', isActive: true } as any,
      [creditAcc('c'), runningAcc('u', 'USD')]
    )).toThrow(/currency/i);
  });

  it('rejects last4 longer than 4 chars', () => {
    expect(() => validateCardInput(
      { kind: 'debit', bankId: 'hsbc', parentAccountId: 'a', name: 'X', currency: 'EGP', last4: '12345', isActive: true } as any,
      [runningAcc('a')]
    )).toThrow(/last4/i);
  });

  it('accepts a valid debit card', () => {
    expect(() => validateCardInput(
      { kind: 'debit', bankId: 'hsbc', parentAccountId: 'a', name: 'X', currency: 'EGP', last4: '4242', isActive: true } as any,
      [runningAcc('a')]
    )).not.toThrow();
  });

  it('accepts a valid credit card', () => {
    expect(() => validateCardInput(
      { kind: 'credit', bankId: 'hsbc', parentAccountId: 'c', name: 'X', currency: 'EGP', creditLimit: 10000, paymentAccountId: 'a', last4: '4242', isActive: true } as any,
      [creditAcc('c'), runningAcc('a')]
    )).not.toThrow();
  });
});

describe('computeStatementStatus', () => {
  const base = (over: Partial<CardStatement>): CardStatement => ({
    id: 's', householdId: 'h', cardId: 'card', creditAccountId: 'credit',
    statementDate: '2026-06-15', statementBalance: 700, dueDate: '2026-07-05',
    status: 'pending', createdAt: '', ...over,
  });

  it('returns pending when no payment linked', () => {
    expect(computeStatementStatus(base({}), 0)).toBe('pending');
  });

  it('returns partial when paid < balance', () => {
    expect(computeStatementStatus(base({}), 300)).toBe('partial');
  });

  it('returns paid when paid >= balance', () => {
    expect(computeStatementStatus(base({}), 700)).toBe('paid');
  });

  it('caps at paid when overpaid', () => {
    expect(computeStatementStatus(base({}), 800)).toBe('paid');
  });
});

describe('cardsLib.payCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbLib.executeBatch).mockResolvedValue(undefined);
    vi.mocked(dbLib.getDocs).mockResolvedValue([]);
    vi.mocked(transactionsLib.createTransaction).mockResolvedValue('payment-id');
  });

  it('grosses up selected original charges and creates the full payment in one batch', async () => {
    vi.mocked(dbLib.getDocs).mockImplementation(async (_householdId, collectionName) => collectionName === 'transactions'
      ? [{ id: 'charge-id', status: 'posted', type: 'expense' }]
      : [{ id: 'charge-line', transactionId: 'charge-id', accountId: 'credit', signedAmount: -999.99, currency: 'EGP', createdAt: '' }]);
    const id = await cardsLib.payCard('h', card, 1_029.99, undefined, ['charge-id'], 'cycle', ['ChatGPT'], { amount: 30, rate: 3 });
    expect(id).toBeTruthy();
    expect(dbLib.executeBatch).toHaveBeenCalledTimes(1);
    const operations = vi.mocked(dbLib.executeBatch).mock.calls[0][1];
    const transactions = operations.filter(operation => operation.collectionName === 'transactions').map(operation => operation.data);
    const payment = transactions.find(transaction => transaction.type === 'transfer');
    expect(payment).toMatchObject({ settlesChargeIds: ['charge-id'], budgetCycleId: 'cycle' });
    expect(operations.find(operation => operation.collectionName === 'ledgerLines' && operation.docId === 'charge-line')?.data).toMatchObject({ signedAmount: -1_029.99, cardFee: { baseAmount: 999.99, rate: 3 } });
    expect(operations.filter(operation => operation.collectionName === 'ledgerLines' && operation.data.transactionId === payment.id).map(operation => operation.data.signedAmount)).toEqual([-1_029.99, 1_029.99]);
    expect(transactionsLib.createTransaction).not.toHaveBeenCalled();
  });

  it('keeps the existing transaction path when there is no fee', async () => {
    await cardsLib.payCard('h', card, 100);
    expect(transactionsLib.createTransaction).toHaveBeenCalledTimes(1);
    expect(dbLib.executeBatch).not.toHaveBeenCalled();
  });

  it('allocates fee and base across multiple selected charges in cents', async () => {
    vi.mocked(dbLib.getDocs).mockImplementation(async (_householdId, collectionName) => collectionName === 'transactions'
      ? [{ id: 'a', status: 'posted' }, { id: 'b', status: 'posted' }]
      : [
        { id: 'line-a', transactionId: 'a', accountId: 'credit', signedAmount: -10, currency: 'EGP', createdAt: '' },
        { id: 'line-b', transactionId: 'b', accountId: 'credit', signedAmount: -20, currency: 'EGP', createdAt: '' },
      ]);
    await cardsLib.payCard('h', card, 33, undefined, ['a', 'b'], undefined, undefined, { amount: 3, rate: 10 });
    const operations = vi.mocked(dbLib.executeBatch).mock.calls[0][1];
    expect(operations.find(operation => operation.docId === 'line-a')?.data).toMatchObject({ signedAmount: -11, cardFee: { baseAmount: 10, rate: 10 } });
    expect(operations.find(operation => operation.docId === 'line-b')?.data).toMatchObject({ signedAmount: -22, cardFee: { baseAmount: 20, rate: 10 } });
  });

  it('uses existing card fee metadata as the base and rejects missing charges before writing', async () => {
    vi.mocked(dbLib.getDocs).mockImplementation(async (_householdId, collectionName) => collectionName === 'transactions'
      ? [{ id: 'charge-id', status: 'posted' }]
      : [{ id: 'charge-line', transactionId: 'charge-id', accountId: 'credit', signedAmount: -1_029.99, cardFee: { baseAmount: 999.99, rate: 3 }, currency: 'EGP', createdAt: '' }]);
    await cardsLib.payCard('h', card, 1_029.99, undefined, ['charge-id'], undefined, undefined, { amount: 30, rate: 3 });
    expect(vi.mocked(dbLib.executeBatch).mock.calls[0][1].find(operation => operation.docId === 'charge-line')?.data.cardFee.baseAmount).toBe(999.99);
    vi.clearAllMocks();
    vi.mocked(dbLib.getDocs).mockResolvedValue([ ]);
    await expect(cardsLib.payCard('h', card, 100, undefined, ['missing'], undefined, undefined, { amount: 3, rate: 3 })).rejects.toThrow(/not found/);
    expect(dbLib.executeBatch).not.toHaveBeenCalled();
  });

  it.each([
    [Number.NaN, undefined, /finite/],
    [0, undefined, /greater than 0/],
    [100, { amount: Number.NaN, rate: 3 }, /fee amount/],
    [100, { amount: 3, rate: 101 }, /fee rate/],
    [100, { amount: 100, rate: 3 }, /less than/],
  ])('rejects invalid payment or fee values', async (amount, fee, error) => {
    await expect(cardsLib.payCard('h', card, amount, undefined, undefined, undefined, undefined, fee as any)).rejects.toThrow(error);
    expect(dbLib.executeBatch).not.toHaveBeenCalled();
    expect(transactionsLib.createTransaction).not.toHaveBeenCalled();
  });
});
