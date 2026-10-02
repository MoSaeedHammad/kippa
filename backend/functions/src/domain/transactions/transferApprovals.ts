import type { Account, FinanceTransaction } from '@kippa/domain';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Owners whose approval a transfer needs: the owners of the source and
 * destination accounts, minus the initiator (whose action IS the offer).
 * An empty result means the transfer posts immediately.
 */
export function requiredTransferApprovers(
  source: Pick<Account, 'ownerUid'>,
  destination: Pick<Account, 'ownerUid'>,
  initiatorUid: string,
): string[] {
  const owners = new Set<string>();
  if (source.ownerUid) owners.add(source.ownerUid);
  if (destination.ownerUid) owners.add(destination.ownerUid);
  owners.delete(initiatorUid);
  return [...owners].sort();
}

export type ApprovalRecord = { uid: string; decidedAt: string };

export type PendingApprovals = {
  remaining: string[];
  approvedBy: ApprovalRecord[];
};

export function pendingApprovalsOf(transferDraft: NonNullable<FinanceTransaction['transferDraft']>): PendingApprovals {
  const approvedBy = transferDraft.approvals.map((approval) => ({ uid: approval.uid, decidedAt: approval.decidedAt }));
  const remaining = transferDraft.requiredApprovals.filter((uid) => !transferDraft.approvals.some((approval) => approval.uid === uid));
  return { remaining, approvedBy };
}

/**
 * Decides whether `uid` may decide a draft transfer: any required approver
 * may act at any time (either owner can reject the whole draft). Returns the
 * remaining approvers after recording the decision, or null when the caller
 * is not a required approver.
 */
export function applyApproval(
  transferDraft: NonNullable<FinanceTransaction['transferDraft']>,
  uid: string,
  now: string,
): { mayDecide: boolean; remaining: string[]; approvedBy: ApprovalRecord[] } {
  if (!transferDraft.requiredApprovals.includes(uid)) {
    return { mayDecide: false, ...pendingApprovalsOf(transferDraft) };
  }
  const approvedBy = [...transferDraft.approvals.filter((approval) => approval.uid !== uid), { uid, decidedAt: now }];
  const remaining = transferDraft.requiredApprovals.filter((uid2) => !approvedBy.some((approval) => approval.uid === uid2));
  return { mayDecide: true, remaining, approvedBy };
}

export type TransferDraftInput = {
  sourceAccountId: unknown;
  destinationAccountId: unknown;
  amount: unknown;
  destinationAmount: unknown;
  date: unknown;
  description: unknown;
};

export type NormalizedTransferDraft = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  destinationAmount: number | null;
  date: string;
  description: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1_000_000_000;

function positiveAmount(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= MAX_AMOUNT ? raw : null;
}

/** Validates a transfer proposal from the FastEntry form. */
export function validateTransferDraftInput(raw: TransferDraftInput, todayIso: string): ValidationResult<NormalizedTransferDraft> {
  const sourceAccountId = typeof raw.sourceAccountId === 'string' ? raw.sourceAccountId.trim() : '';
  const destinationAccountId = typeof raw.destinationAccountId === 'string' ? raw.destinationAccountId.trim() : '';
  if (!sourceAccountId) return { ok: false, error: 'sourceAccountId is required.' };
  if (!destinationAccountId) return { ok: false, error: 'destinationAccountId is required.' };
  if (sourceAccountId === destinationAccountId) return { ok: false, error: 'Choose two different accounts.' };
  const amount = positiveAmount(raw.amount);
  if (amount == null) return { ok: false, error: 'Amount must be a positive number.' };
  const destinationAmount = raw.destinationAmount == null ? null : positiveAmount(raw.destinationAmount);
  if (raw.destinationAmount != null && destinationAmount == null) {
    return { ok: false, error: 'Destination amount must be a positive number.' };
  }
  const date = typeof raw.date === 'string' && ISO_DATE.test(raw.date) ? raw.date : todayIso;
  if (!ISO_DATE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'date must be a YYYY-MM-DD calendar date.' };
  }
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : '';
  return { ok: true, value: { sourceAccountId, destinationAccountId, amount, destinationAmount, date, description } };
}
