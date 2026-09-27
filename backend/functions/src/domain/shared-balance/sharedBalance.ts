import type { FinanceTransaction, LedgerLine, SharedBalanceEntry, SharedBalanceEntryKind } from '@kippa/domain';

export type SharedBalanceDirection = 'caller_paid' | 'counterparty_paid';

export type NormalizedSharedBalanceInput = {
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  date: string;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const KINDS: readonly SharedBalanceEntryKind[] = ['iou', 'split', 'repayment'];
const DIRECTIONS: readonly SharedBalanceDirection[] = ['caller_paid', 'counterparty_paid'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_AMOUNT = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates and normalizes a proposed shared-balance entry.
 * `direction` is relative to the caller: caller_paid means the caller provided
 * the money; counterparty_paid means the counterparty did (repayments arrive
 * from either side). The counterparty must differ from the caller.
 */
export function validateSharedBalanceEntryInput(
  raw: unknown,
  callerUid: string,
  todayIso: string,
): ValidationResult<NormalizedSharedBalanceInput> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid request body.' };
  const kind = raw.kind as unknown;
  if (typeof kind !== 'string' || !KINDS.includes(kind as SharedBalanceEntryKind)) {
    return { ok: false, error: 'kind must be one of iou, split, repayment.' };
  }
  const direction = raw.direction as unknown;
  if (typeof direction !== 'string' || !DIRECTIONS.includes(direction as SharedBalanceDirection)) {
    return { ok: false, error: 'direction must be caller_paid or counterparty_paid.' };
  }
  const counterpartyUid = typeof raw.counterpartyUid === 'string' ? raw.counterpartyUid.trim() : '';
  if (!counterpartyUid) return { ok: false, error: 'counterpartyUid is required.' };
  if (counterpartyUid === callerUid) {
    return { ok: false, error: 'counterpartyUid must be another member, not yourself.' };
  }
  const amount = raw.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  if (!CURRENCY.test(currency)) return { ok: false, error: 'currency must be an ISO 4217 code.' };
  const typeLabel = typeof raw.typeLabel === 'string' ? raw.typeLabel.trim() : '';
  if (!typeLabel || typeLabel.length > 40) {
    return { ok: false, error: 'Type label must be 1-40 characters.' };
  }
  let note: string | null = null;
  if (typeof raw.note === 'string' && raw.note.trim()) {
    if (raw.note.trim().length > 280) return { ok: false, error: 'Note must be at most 280 characters.' };
    note = raw.note.trim();
  }
  const date = typeof raw.date === 'string' && raw.date.trim() ? raw.date.trim() : todayIso;
  if (!ISO_DATE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'date must be a YYYY-MM-DD calendar date.' };
  }
  const fromUid = direction === 'caller_paid' ? callerUid : counterpartyUid;
  const toUid = direction === 'caller_paid' ? counterpartyUid : callerUid;
  return { ok: true, value: { kind: kind as SharedBalanceEntryKind, fromUid, toUid, amount, currency, typeLabel, note, date } };
}

/**
 * Net shared balance from one viewer's perspective over approved entries:
 * positive = the viewer is owed, negative = the viewer owes.
 * Pending/rejected/cancelled entries never move the balance.
 */
export function computeSharedBalances(
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

/** The member who must approve the entry: the non-author party. */
export function counterpartyOf(entry: Pick<SharedBalanceEntry, 'createdBy' | 'fromUid' | 'toUid'>): string {
  return entry.createdBy === entry.fromUid ? entry.toUid : entry.fromUid;
}

export function isCounterparty(
  entry: Pick<SharedBalanceEntry, 'createdBy' | 'fromUid' | 'toUid'>,
  uid: string,
): boolean {
  return counterpartyOf(entry) === uid && uid !== entry.createdBy;
}

/**
 * Builds the posted adjustment transaction + single ledger line that mirrors
 * an approved entry into the main ledger. The virtual shared-balance account
 * is anchored to the household owner: positive = the other member owes the
 * owner. For a two-member shared account this reads correctly for the owner
 * and flipped for the other full member.
 */
export function buildSharedBalanceMirror(
  entry: Pick<SharedBalanceEntry, 'id' | 'householdId' | 'fromUid' | 'amount' | 'currency' | 'typeLabel' | 'date' | 'createdBy'>,
  opts: { ownerUid: string; sharedAccountId: string; transactionId: string; now: string },
): { transaction: Omit<FinanceTransaction, 'id'> & { id: string }; ledgerLine: Omit<LedgerLine, 'id'> & { id: string } } {
  const signedAmount = entry.fromUid === opts.ownerUid ? entry.amount : -entry.amount;
  return {
    transaction: {
      id: opts.transactionId,
      householdId: entry.householdId,
      type: 'adjustment',
      date: entry.date,
      description: `Shared balance: ${entry.typeLabel}`,
      categoryId: null,
      budgetCycleId: null,
      createdBy: entry.createdBy,
      createdAt: opts.now,
      updatedAt: opts.now,
      status: 'posted',
      sharedBalanceEntryId: entry.id,
    },
    ledgerLine: {
      id: `${opts.transactionId}_shared`,
      householdId: entry.householdId,
      transactionId: opts.transactionId,
      accountId: opts.sharedAccountId,
      signedAmount,
      currency: entry.currency,
      createdAt: opts.now,
    },
  };
}

/** Tag attached to a bank-message approval to create a shared-balance entry. */
export type SharedBalanceTag = { kind: 'iou' | 'split'; counterpartyUid: string; amount: number | null };

/** Editable fields of an existing entry. Counterparty, kind and direction are immutable. */
export type SharedBalanceEntryEdits = {
  amount: number;
  typeLabel: string;
  note: string | null;
  date: string;
};

/**
 * Validates an author's edit to an existing entry. Only provided fields are
 * changed; edits reset an approved entry to pending (counterparty re-approval).
 */
export function validateSharedBalanceEntryEdits(
  raw: unknown,
): ValidationResult<Partial<SharedBalanceEntryEdits>> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid edits.' };
  const edits: Partial<SharedBalanceEntryEdits> = {};
  if (raw.amount !== undefined) {
    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount > MAX_AMOUNT) {
      return { ok: false, error: 'Amount must be a positive number.' };
    }
    edits.amount = raw.amount;
  }
  if (raw.typeLabel !== undefined) {
    const typeLabel = typeof raw.typeLabel === 'string' ? raw.typeLabel.trim() : '';
    if (!typeLabel || typeLabel.length > 40) {
      return { ok: false, error: 'Type label must be 1-40 characters.' };
    }
    edits.typeLabel = typeLabel;
  }
  if (raw.note !== undefined) {
    if (raw.note !== null && typeof raw.note !== 'string') return { ok: false, error: 'Note must be text.' };
    if (typeof raw.note === 'string' && raw.note.trim().length > 280) {
      return { ok: false, error: 'Note must be at most 280 characters.' };
    }
    edits.note = typeof raw.note === 'string' ? raw.note.trim() : null;
  }
  if (raw.date !== undefined) {
    if (typeof raw.date !== 'string' || !ISO_DATE.test(raw.date) || Number.isNaN(new Date(`${raw.date}T12:00:00Z`).getTime())) {
      return { ok: false, error: 'date must be a YYYY-MM-DD calendar date.' };
    }
    edits.date = raw.date;
  }
  if (Object.keys(edits).length === 0) return { ok: false, error: 'No editable fields provided.' };
  return { ok: true, value: edits };
}


/**
 * Validates the sharedBalanceTag argument of approvePendingFinancialMessage.
 * IOUs take the full message amount; splits require the counterparty's share.
 */
export function validateSharedBalanceTag(raw: unknown): ValidationResult<SharedBalanceTag> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid sharedBalanceTag.' };
  const kind = raw.kind as unknown;
  if (kind !== 'iou' && kind !== 'split') return { ok: false, error: 'kind must be iou or split.' };
  const counterpartyUid = typeof raw.counterpartyUid === 'string' ? raw.counterpartyUid.trim() : '';
  if (!counterpartyUid) return { ok: false, error: 'counterpartyUid is required.' };
  let amount: number | null = null;
  if (kind === 'split') {
    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount <= 0) {
      return { ok: false, error: 'Share amount is required for splits.' };
    }
    amount = raw.amount;
  }
  return { ok: true, value: { kind, counterpartyUid, amount } };
}
