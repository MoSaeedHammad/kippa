import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { SharedBalanceEntry, SharedBalanceEntryKind } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

/** Labels for the banking-style type label chips (same list on both sides of the app). */
export const SHARED_BALANCE_TYPE_LABELS = [
  'Cash',
  'InstaPay',
  'Bank transfer',
  'Loan',
  'Shared bill',
  'Other',
] as const;

/**
 * Net shared balance from the viewer's perspective over approved entries.
 * Positive = the viewer is owed; negative = the viewer owes. Mirrors the
 * server-side computeSharedBalances — keep both in sync.
 */
export function computeSharedBalance(
  entries: Pick<SharedBalanceEntry, 'status' | 'fromUid' | 'toUid' | 'amount'>[],
  viewerUid: string,
): number {
  return entries.reduce((net, entry) => {
    if (entry.status !== 'approved') return net;
    if (entry.fromUid === viewerUid) return net + entry.amount;
    if (entry.toUid === viewerUid) return net - entry.amount;
    return net;
  }, 0);
}

export const sharedBalanceLib = {
  async getEntries(householdId: string): Promise<SharedBalanceEntry[]> {
    const items = await dbLib.getDocs(householdId, 'sharedBalanceEntries') as SharedBalanceEntry[];
    return items.sort((a, b) => {
      if (a.status !== b.status) {
        const rank: Record<SharedBalanceEntry['status'], number> = { pending: 0, approved: 1, rejected: 2, cancelled: 3 };
        return rank[a.status] - rank[b.status];
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  },

  async propose(data: {
    householdId: string;
    kind: SharedBalanceEntryKind;
    direction: 'caller_paid' | 'counterparty_paid';
    counterpartyUid: string;
    amount: number;
    currency: string;
    typeLabel: string;
    note?: string | null;
    date?: string;
  }): Promise<string> {
    const callable = httpsCallable<typeof data, { entryId: string }>(
      requireFunctions(),
      'proposeSharedBalanceEntry',
    );
    return (await callable(data)).data.entryId;
  },

  async decide(
    householdId: string,
    entryId: string,
    action: 'approve' | 'reject' | 'cancel',
  ): Promise<string> {
    const callable = httpsCallable<
      { householdId: string; entryId: string; action: string },
      { status: string }
    >(requireFunctions(), 'decideSharedBalanceEntry');
    return (await callable({ householdId, entryId, action })).data.status;
  },

  async edit(data: {
    householdId: string;
    entryId: string;
    amount?: number;
    typeLabel?: string;
    note?: string | null;
    date?: string;
  }): Promise<string> {
    const callable = httpsCallable<
      { householdId: string; entryId: string; action: string; edits: Record<string, unknown> },
      { status: string }
    >(requireFunctions(), 'decideSharedBalanceEntry');
    const { householdId, entryId, ...edits } = data;
    return (await callable({ householdId, entryId, action: 'edit', edits })).data.status;
  },
};
