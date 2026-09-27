import { describe, expect, it } from 'vitest';
import type { SharedBalanceEntry } from '@kippa/domain';
import {
  buildSharedBalanceMirror,
  computeSharedBalances,
  counterpartyOf,
  isCounterparty,
  validateSharedBalanceEntryEdits,
  validateSharedBalanceEntryInput,
  validateSharedBalanceTag,
} from './sharedBalance.js';

const caller = 'uid_me';
const brother = 'uid_brother';

const validInput = {
  kind: 'iou',
  direction: 'caller_paid',
  counterpartyUid: brother,
  amount: 300,
  currency: 'EGP',
  typeLabel: 'Cash',
};

describe('validateSharedBalanceEntryInput', () => {
  it('accepts a valid caller-paid IOU', () => {
    const result = validateSharedBalanceEntryInput(validInput, caller, '2026-09-27');
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'iou',
        fromUid: caller,
        toUid: brother,
        amount: 300,
        currency: 'EGP',
        typeLabel: 'Cash',
        note: null,
        date: '2026-09-27',
      },
    });
  });

  it('maps counterparty_paid to a from/to flip (repayment received)', () => {
    const result = validateSharedBalanceEntryInput(
      { ...validInput, kind: 'repayment', direction: 'counterparty_paid', typeLabel: 'InstaPay' },
      caller,
      '2026-09-27',
    );
    expect(result.ok && result.value.fromUid).toBe(brother);
    expect(result.ok && result.value.toUid).toBe(caller);
  });

  it('defaults the date to today', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, date: undefined }, caller, '2026-09-27');
    expect(result.ok && result.value.date).toBe('2026-09-27');
  });

  it('rejects self-referencing entries', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, counterpartyUid: caller }, caller, '2026-09-27');
    expect(!result.ok && result.error).toContain('counterparty');
  });

  it('rejects non-positive amounts', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, amount: 0 }, caller, '2026-09-27');
    expect(!result.ok && result.error).toContain('Amount');
  });

  it('rejects unknown kinds', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, kind: 'debt' }, caller, '2026-09-27');
    expect(!result.ok && result.error).toContain('kind');
  });

  it('rejects malformed dates', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, date: '27/09/2026' }, caller, '2026-09-27');
    expect(!result.ok && result.error).toContain('date');
  });

  it('rejects over-long type labels', () => {
    const result = validateSharedBalanceEntryInput({ ...validInput, typeLabel: 'x'.repeat(41) }, caller, '2026-09-27');
    expect(!result.ok && result.error).toContain('Type label');
  });
});

describe('computeSharedBalances', () => {
  const entry = (over: Partial<SharedBalanceEntry>): SharedBalanceEntry => ({
    id: 'e', householdId: 'hh', kind: 'iou', fromUid: caller, toUid: brother,
    amount: 100, currency: 'EGP', typeLabel: 'Cash', date: '2026-09-27',
    status: 'approved', createdBy: caller, revision: 1,
    fromDisplayName: 'Me', toDisplayName: 'Brother', createdAt: '', updatedAt: '',
    ...over,
  });

  it('sums only approved entries from the viewer perspective', () => {
    const total = computeSharedBalances([
      entry({ id: '1', amount: 300 }),                       // brother owes me 300
      entry({ id: '2', kind: 'repayment', fromUid: brother, toUid: caller, amount: 200 }), // he repaid 200
      entry({ id: '3', amount: 50, status: 'pending' }),     // pending — must not count
    ], caller);
    expect(total).toBe(100);
  });

  it('is the negation for the counterparty view', () => {
    const entries = [entry({ id: '1', amount: 300 })];
    expect(computeSharedBalances(entries, caller)).toBe(300);
    expect(computeSharedBalances(entries, brother)).toBe(-300);
  });
});

describe('counterpartyOf / isCounterparty', () => {
  const entry: SharedBalanceEntry = {
    id: 'e', householdId: 'hh', kind: 'iou', fromUid: caller, toUid: brother,
    amount: 10, currency: 'EGP', typeLabel: 'Cash', date: '2026-09-27',
    status: 'pending', createdBy: caller, revision: 1,
    fromDisplayName: 'Me', toDisplayName: 'Brother', createdAt: '', updatedAt: '',
  };

  it('derives the counterparty as the non-author party', () => {
    expect(counterpartyOf(entry)).toBe(brother);
    expect(isCounterparty(entry, brother)).toBe(true);
    expect(isCounterparty(entry, caller)).toBe(false);
  });
});

describe('buildSharedBalanceMirror', () => {
  const entry: SharedBalanceEntry = {
    id: 'sb_1', householdId: 'hh', kind: 'iou', fromUid: caller, toUid: brother,
    amount: 300, currency: 'EGP', typeLabel: 'Cash', date: '2026-09-27',
    status: 'approved', createdBy: caller, revision: 1,
    fromDisplayName: 'Me', toDisplayName: 'Brother', createdAt: '', updatedAt: '',
  };

  it('anchors the ledger line to the household owner perspective', () => {
    const { transaction, ledgerLine } = buildSharedBalanceMirror(entry, {
      ownerUid: caller,
      sharedAccountId: 'shared_balance',
      transactionId: 'mirror_sb_1_r1',
      now: '2026-09-27T10:00:00.000Z',
    });
    expect(transaction.type).toBe('adjustment');
    expect(transaction.status).toBe('posted');
    expect(transaction.sharedBalanceEntryId).toBe('sb_1');
    expect(ledgerLine.signedAmount).toBe(300);
  });

  it('flips the sign when the owner is the debtor side', () => {
    const { ledgerLine } = buildSharedBalanceMirror(entry, {
      ownerUid: brother,
      sharedAccountId: 'shared_balance',
      transactionId: 'mirror_sb_1_r1',
      now: '2026-09-27T10:00:00.000Z',
    });
    expect(ledgerLine.signedAmount).toBe(-300);
  });
});

describe('validateSharedBalanceEntryEdits', () => {
  it('keeps only the provided fields', () => {
    const result = validateSharedBalanceEntryEdits({ amount: 250, note: 'lunch' });
    expect(result).toEqual({ ok: true, value: { amount: 250, note: 'lunch' } });
  });

  it('rejects empty edits and bad values', () => {
    expect(!validateSharedBalanceEntryEdits({}).ok).toBe(true);
    expect(!validateSharedBalanceEntryEdits({ amount: -1 }).ok).toBe(true);
    expect(!validateSharedBalanceEntryEdits({ date: 'bad' }).ok).toBe(true);
    expect(!validateSharedBalanceEntryEdits({ typeLabel: '' }).ok).toBe(true);
  });

  it('accepts an explicit null note', () => {
    const result = validateSharedBalanceEntryEdits({ note: null });
    expect(result.ok && result.value.note).toBeNull();
  });
});

describe('validateSharedBalanceTag', () => {
  it('accepts an IOU tag without an explicit amount', () => {
    const result = validateSharedBalanceTag({ kind: 'iou', counterpartyUid: brother });
    expect(result).toEqual({ ok: true, value: { kind: 'iou', counterpartyUid: brother, amount: null } });
  });

  it('requires a share amount for splits', () => {
    const missing = validateSharedBalanceTag({ kind: 'split', counterpartyUid: brother });
    expect(!missing.ok && missing.error).toContain('Share amount');
    const ok = validateSharedBalanceTag({ kind: 'split', counterpartyUid: brother, amount: 250 });
    expect(ok.ok && ok.value.amount).toBe(250);
  });

  it('rejects unknown kinds and missing counterparties', () => {
    expect(!validateSharedBalanceTag({ kind: 'gift', counterpartyUid: brother }).ok).toBe(true);
    expect(!validateSharedBalanceTag({ kind: 'iou', counterpartyUid: '' }).ok).toBe(true);
  });
});
