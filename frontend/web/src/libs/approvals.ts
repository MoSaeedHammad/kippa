import type { SharedBalanceEntry } from '@kippa/domain';

/**
 * Unified Approvals model. The /pending surface merges bank messages with
 * shared-balance entries (and later transfer drafts and recurring
 * confirmations) as typed items, so every decision the viewer owes lives in
 * one list.
 */

export type ApprovalEntryKind = 'iou' | 'split' | 'repayment';

export type SharedBalanceApprovalItem = {
  id: string;
  kind: ApprovalEntryKind;
  /** Type label chosen by the author (Cash, InstaPay, shared bill…). */
  typeLabel: string;
  amount: number;
  currency: string;
  date: string;
  note: string | null;
  createdBy: string;
  createdByDisplayName: string;
  counterpartyDisplayName: string;
  /** True when the viewer is the counterparty who must decide. */
  awaitsViewer: boolean;
  status: SharedBalanceEntry['status'];
};

const KIND_ORDER: Record<ApprovalEntryKind, number> = { iou: 0, split: 1, repayment: 2 };

function counterpartyDisplayNameOf(entry: SharedBalanceEntry): string {
  return entry.createdBy === entry.fromUid ? entry.toDisplayName : entry.fromDisplayName;
}

export function isSharedBalanceEntry(value: unknown): value is SharedBalanceEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SharedBalanceEntry>;
  return typeof candidate.id === 'string'
    && typeof candidate.fromUid === 'string'
    && typeof candidate.toUid === 'string'
    && typeof candidate.amount === 'number'
    && (candidate.status === 'pending' || candidate.status === 'approved' || candidate.status === 'rejected' || candidate.status === 'cancelled');
}

/** Projects raw shared-balance entries into approval items from one viewer's perspective. */
export function toSharedBalanceApprovalItems(
  entries: SharedBalanceEntry[],
  viewerUid: string,
): SharedBalanceApprovalItem[] {
  return entries
    .filter((entry) => entry.fromUid === viewerUid || entry.toUid === viewerUid)
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind as ApprovalEntryKind,
      typeLabel: entry.typeLabel,
      amount: entry.amount,
      currency: entry.currency,
      date: entry.date,
      note: entry.note ?? null,
      createdBy: entry.createdBy,
      createdByDisplayName: entry.createdBy === entry.fromUid ? entry.fromDisplayName : entry.toDisplayName,
      counterpartyDisplayName: counterpartyDisplayNameOf(entry),
      awaitsViewer: entry.status === 'pending' && entry.createdBy !== viewerUid,
      status: entry.status,
    }))
    .sort((left, right) => {
      if (left.awaitsViewer !== right.awaitsViewer) return left.awaitsViewer ? -1 : 1;
      if (left.status !== right.status) return statusRank(left.status) - statusRank(right.status);
      return left.date.localeCompare(right.date) || KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    });
}

function statusRank(status: SharedBalanceEntry['status']): number {
  return status === 'pending' ? 0 : status === 'approved' ? 1 : status === 'rejected' ? 2 : 3;
}

/** How many decisions the viewer personally owes across approval sources. */
export function pendingForViewerCount(
  entries: SharedBalanceEntry[],
  viewerUid: string,
): number {
  return entries.filter(
    (entry) => entry.status === 'pending'
      && entry.createdBy !== viewerUid
      && (entry.fromUid === viewerUid || entry.toUid === viewerUid),
  ).length;
}
