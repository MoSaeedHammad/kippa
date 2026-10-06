import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, FinanceTransaction, LedgerLine } from '@kippa/domain';

const dbMocks = vi.hoisted(() => ({
  executeBatch: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('@/libs/db', () => ({ dbLib: dbMocks }));

import { dbLib } from '@/libs/db';
import { transactionsLib } from './transactions';
import { ledgerLib } from './ledger';

const credit: Account = { id: 'credit', householdId: 'h', name: 'Credit', type: 'credit', currency: 'EGP', isActive: true, sortOrder: 0, createdAt: '' };
const bank: Account = { id: 'bank', householdId: 'h', name: 'Bank', type: 'running', currency: 'EGP', isActive: true, sortOrder: 1, createdAt: '' };
const expense = { type: 'expense' as const, date: '2026-01-10', createdBy: 'u', description: 'ChatGPT' };

const savedOperations = () => vi.mocked(dbLib.executeBatch).mock.calls[0][1];

describe('transaction and ledger credit-card fee integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.executeBatch.mockResolvedValue(undefined);
    dbMocks.getDoc.mockResolvedValue(credit);
  });

  it('persists the gross amount and fee metadata for a new EGP credit expense', async () => {
    await transactionsLib.createTransaction('h', expense, [{ accountId: 'credit', signedAmount: -100, currency: 'EGP' }]);
    expect(savedOperations().find(operation => operation.collectionName === 'ledgerLines')?.data).toMatchObject({
      signedAmount: -103,
      cardFee: { baseAmount: 100, rate: 3 },
    });
  });

  it('leaves a non-credit account expense unchanged', async () => {
    dbMocks.getDoc.mockResolvedValue(bank);
    await transactionsLib.createTransaction('h', expense, [{ accountId: 'bank', signedAmount: -100, currency: 'EGP' }]);
    expect(savedOperations().find(operation => operation.collectionName === 'ledgerLines')?.data).toMatchObject({ signedAmount: -100 });
    expect(savedOperations().find(operation => operation.collectionName === 'ledgerLines')?.data.cardFee).toBeUndefined();
  });

  it('does not double a line that already has fee metadata', async () => {
    await transactionsLib.createTransaction('h', expense, [{ accountId: 'credit', signedAmount: -103, currency: 'EGP', cardFee: { baseAmount: 100, rate: 3 } }]);
    expect(savedOperations().find(operation => operation.collectionName === 'ledgerLines')?.data).toMatchObject({
      signedAmount: -103,
      cardFee: { baseAmount: 100, rate: 3 },
    });
  });

  it('writes supplied fee metadata on update and clears it for a later non-fee update', async () => {
    const existing: FinanceTransaction = { id: 'tx', householdId: 'h', ...expense, status: 'posted', createdAt: '', updatedAt: '' };
    const existingLine: LedgerLine = { id: 'line', householdId: 'h', transactionId: 'tx', accountId: 'credit', signedAmount: -100, currency: 'EGP', createdAt: '' };
    dbMocks.getDoc.mockResolvedValue(existing);
    dbMocks.getDocs.mockResolvedValue([existingLine]);

    await transactionsLib.updateTransaction('h', 'tx', {}, { accountId: 'credit', signedAmount: -103, currency: 'EGP', cardFee: { baseAmount: 100, rate: 3 } });
    expect(savedOperations().find(operation => operation.docId === 'line')?.data).toMatchObject({ signedAmount: -103, cardFee: { baseAmount: 100, rate: 3 } });

    dbMocks.executeBatch.mockClear();
    await transactionsLib.updateTransaction('h', 'tx', {}, { accountId: 'credit', signedAmount: -50, currency: 'EGP' });
    const updated = vi.mocked(dbLib.executeBatch).mock.calls[0][1].find(operation => operation.docId === 'line')?.data;
    expect(updated).toMatchObject({ signedAmount: -50 });
    expect(updated.cardFee).toBeUndefined();
  });

  it('returns centrally projected gross lines for legacy unpaid credit purchases', async () => {
    const tx: FinanceTransaction = { id: 'legacy', householdId: 'h', ...expense, status: 'posted', createdAt: '', updatedAt: '' };
    const legacyLine: LedgerLine = { id: 'legacy-line', householdId: 'h', transactionId: 'legacy', accountId: 'credit', signedAmount: -100, currency: 'EGP', createdAt: '' };
    dbMocks.getDocs.mockImplementation(async (_householdId: string, collection: string) => collection === 'accounts' ? [credit] : collection === 'transactions' ? [tx] : [legacyLine]);
    const lines = await ledgerLib.getLedgerLines('h');
    expect(lines).toEqual([expect.objectContaining({ signedAmount: -103, cardFee: { baseAmount: 100, rate: 3 } })]);
  });
});
