import { describe, expect, it } from 'vitest';
import {
  applyApproval,
  pendingApprovalsOf,
  requiredTransferApprovers,
  validateTransferDraftInput,
} from './transferApprovals.js';

describe('requiredTransferApprovers', () => {
  it('collects both owners minus the initiator', () => {
    expect(requiredTransferApprovers({ ownerUid: 'a' }, { ownerUid: 'b' }, 'a')).toEqual(['b']);
    expect(requiredTransferApprovers({ ownerUid: 'a' }, { ownerUid: 'b' }, 'c')).toEqual(['a', 'b']);
  });

  it('posts immediately when the initiator owns both accounts or they are unowned', () => {
    expect(requiredTransferApprovers({ ownerUid: 'a' }, { ownerUid: 'a' }, 'a')).toEqual([]);
    expect(requiredTransferApprovers({}, {}, 'a')).toEqual([]);
  });
});

describe('applyApproval', () => {
  const draft = {
    sourceAccountId: 'src', destinationAccountId: 'dst',
    amount: 100, currency: 'EGP', destinationAmount: 100, destinationCurrency: 'EGP',
    requiredApprovals: ['a', 'b'], approvals: [],
  };
  const now = '2026-10-02T00:00:00.000Z';

  it('records one approval and computes the remainder', () => {
    const result = applyApproval(draft, 'a', now);
    expect(result.mayDecide).toBe(true);
    expect(result.approvedBy.map((x) => x.uid)).toEqual(['a']);
    expect(result.remaining).toEqual(['b']);
  });

  it('completes when the last approver acts', () => {
    const once = applyApproval(draft, 'a', now);
    const twice = applyApproval({ ...draft, approvals: once.approvedBy }, 'b', now);
    expect(twice.remaining).toEqual([]);
  });

  it('refuses non-approvers and allows changing one’s own decision', () => {
    expect(applyApproval(draft, 'z', now).mayDecide).toBe(false);
    const changed = applyApproval({ ...draft, approvals: [{ uid: 'a', decidedAt: 'earlier' }] }, 'a', now);
    expect(changed.approvedBy).toHaveLength(1);
    expect(changed.approvedBy[0].decidedAt).toBe(now);
  });

  it('exposes pending state', () => {
    expect(pendingApprovalsOf({ ...draft, approvals: [{ uid: 'a', decidedAt: now }] }).remaining).toEqual(['b']);
  });
});

describe('validateTransferDraftInput', () => {
  const base = { sourceAccountId: 'src', destinationAccountId: 'dst', amount: 50, destinationAmount: null, date: '2026-10-02', description: 'rent share' };

  it('accepts a valid proposal and defaults the date', () => {
    const ok = validateTransferDraftInput({ ...base, date: undefined }, '2026-10-02');
    expect(ok.ok && ok.value.date).toBe('2026-10-02');
  });

  it('rejects identical accounts and bad amounts', () => {
    expect(!validateTransferDraftInput({ ...base, sourceAccountId: 'dst' }, '2026-10-02').ok).toBe(true);
    expect(!validateTransferDraftInput({ ...base, amount: 0 }, '2026-10-02').ok).toBe(true);
    expect(!validateTransferDraftInput({ ...base, destinationAmount: -1 }, '2026-10-02').ok).toBe(true);
  });
});
