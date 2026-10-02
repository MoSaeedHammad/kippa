import { describe, expect, it } from 'vitest';
import type { SharedBalanceEntry } from '@kippa/domain';
import { pendingForViewerCount, toSharedBalanceApprovalItems } from './approvals';

const me = 'uid_me';
const brother = 'uid_brother';

const entry = (over: Partial<SharedBalanceEntry>): SharedBalanceEntry => ({
  id: 'e1', householdId: 'hh', kind: 'iou', fromUid: brother, toUid: me,
  amount: 250, currency: 'EGP', typeLabel: 'Cash', date: '2026-10-01',
  status: 'pending', createdBy: brother, revision: 1,
  fromDisplayName: 'Brother', toDisplayName: 'Me', createdAt: '', updatedAt: '',
  ...over,
});

describe('toSharedBalanceApprovalItems', () => {
  it('flags entries that await the viewer and sorts them first', () => {
    const items = toSharedBalanceApprovalItems([
      entry({ id: 'mine', createdBy: me, status: 'pending' }),
      entry({ id: 'theirs', createdBy: brother, status: 'pending' }),
      entry({ id: 'old-approved', createdBy: brother, status: 'approved' }),
    ], me);
    expect(items.map((item) => item.id)).toEqual(['theirs', 'mine', 'old-approved']);
    expect(items[0].awaitsViewer).toBe(true);
    expect(items[1].awaitsViewer).toBe(false);
  });

  it('derives names so the viewer knows who acts', () => {
    const [item] = toSharedBalanceApprovalItems([entry({})], me);
    expect(item.createdByDisplayName).toBe('Brother');
    expect(item.counterpartyDisplayName).toBe('Me');
  });

  it('drops entries that do not involve the viewer', () => {
    const items = toSharedBalanceApprovalItems([
      entry({ id: 'other-pair', fromUid: 'a', toUid: 'b', fromDisplayName: 'A', toDisplayName: 'B' }),
    ], me);
    expect(items).toHaveLength(0);
  });
});

describe('pendingForViewerCount', () => {
  it('counts only pending entries authored by someone else', () => {
    const count = pendingForViewerCount([
      entry({ id: '1', createdBy: brother, status: 'pending' }),
      entry({ id: '2', createdBy: me, status: 'pending' }),
      entry({ id: '3', createdBy: brother, status: 'approved' }),
    ], me);
    expect(count).toBe(1);
  });
});
