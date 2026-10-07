import { describe, expect, it } from 'vitest';
import { recordReceiptKey, sanitizeHistoryRecords } from './historyRecords.js';

describe('sanitizeHistoryRecords', () => {
  it('accepts the documented record shape', () => {
    const records = sanitizeHistoryRecords([
      { kind: 'expense', date: '2025-03-14', amount: 249.5, currency: 'EGP', description: 'Groceries', merchant: 'Metro', accountId: 'acc1', categoryId: 'food' },
    ]);
    expect(records[0]).toMatchObject({ kind: 'expense', date: '2025-03-14', amount: 249.5, currency: 'EGP', description: 'Groceries', counterparty: 'Metro', accountId: 'acc1', categoryId: 'food' });
    expect(records[0].canonical).toContain('expense|2025-03-14|249.5|EGP');
  });

  it('auto-maps tolerant key aliases', () => {
    const records = sanitizeHistoryRecords([
      { type: 'transfer', date: '2025-03-14', value: '1,200', currency: 'egp', note: 'rent', person: 'Omar', account: 'acc1', toAccount: 'acc2', category: 'housing' },
      { date: '2025-03-15', amount: 90, currency: 'USD', label: 'topup', payee: 'Vodafone' },
    ]);
    expect(records[0]).toMatchObject({ kind: 'transfer', amount: 1200, currency: 'EGP', counterparty: 'Omar', destinationAccountId: 'acc2', categoryId: null });
    expect(records[1]).toMatchObject({ kind: 'expense', counterparty: 'Vodafone' });
  });

  it('drops unusable entries and keeps valid ones', () => {
    const records = sanitizeHistoryRecords([
      null,
      { date: '2025-03-14', amount: 10, currency: 'EGP' },
      { date: '14/03/2025', amount: 10, currency: 'EGP' },
      { date: '2025-03-14', amount: -3, currency: 'EGP' },
      { date: '2025-03-14', amount: 10, currency: 'EURO' },
      { date: '2025-03-14', amount: 10, currency: 'EGP', type: 'barter' },
      { date: '2025-03-14', amount: 0, currency: 'EGP' },
    ]);
    expect(records).toHaveLength(1);
  });

  it('dedupes stably per household and per record', () => {
    const canonical = 'expense|2025-03-14|10|EGP|coffee||';
    expect(recordReceiptKey('hh1', canonical)).toBe(recordReceiptKey('hh1', canonical));
    expect(recordReceiptKey('hh1', canonical)).not.toBe(recordReceiptKey('hh2', canonical));
    expect(recordReceiptKey('hh1', canonical)).not.toBe(recordReceiptKey('hh1', 'expense|2025-03-15|10|EGP|coffee||'));
  });
});
