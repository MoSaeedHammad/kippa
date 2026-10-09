import { createHash } from 'node:crypto';
import type { HistoryImportMessage } from '@kippa/domain';
import { extractMessage, extractSender, extractSmsDate } from './ingestBody.js';

/** Per-callable-call cap so one request stays well inside memory and time budgets. */
export const MAX_MESSAGES_PER_IMPORT = 1000;
/** Same per-message ceiling as the live webhook. */
export const MAX_IMPORT_BODY_LENGTH = 5_000;

/**
 * Receipt id for history imports. The pseudo credential part is per household
 * so two spaces importing identical text never collide, and the dedupe
 * material is the whitespace-normalized message — exactly like the webhook —
 * so a message already staged (or resolved) by a live forward is never
 * double-staged by an import, and re-importing the same file is a no-op.
 */
export function importReceiptKey(householdId: string, message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`history-import_${householdId}\0${normalized}`).digest('hex');
}

export type SanitizedHistoryMessage = {
  text: string;
  sender: string;
  dateMs: number | null;
};

/**
 * Validates the client-supplied message array in place and auto-maps the
 * forwarder payload shape: each entry may carry its text under `text` (the
 * documented shape) or any webhook-accepted alias (`body`, `message`, `sms`,
 * `content`), the bank sender under `sender` (or `from`/`address`), and its
 * timestamp as `dateMs` epoch (milli)seconds or any webhook stamp key
 * (`receivedStamp`, `timestamp`, `date`, …). Unusable entries are dropped;
 * only structural problems throw.
 */
export function sanitizeHistoryMessages(input: unknown): SanitizedHistoryMessage[] {
  if (!Array.isArray(input)) throw new TypeError('messages must be an array.');
  const messages: SanitizedHistoryMessage[] = [];
  for (const entry of input.slice(0, MAX_MESSAGES_PER_IMPORT)) {
    if (!entry || typeof entry !== 'object') continue;
    const text = extractMessage(entry);
    if (!text || text.trim().length > MAX_IMPORT_BODY_LENGTH) continue;
    const sender = extractSender(entry).slice(0, 64);
    const record = entry as Record<string, unknown>;
    let dateMs: number | null = typeof record.dateMs === 'number' && Number.isFinite(record.dateMs) && record.dateMs > 0
      ? record.dateMs
      : null;
    if (dateMs == null) {
      // Fall back to the webhook stamp keys; they resolve to a YYYY-MM-DD.
      const stampDate = extractSmsDate(entry);
      if (stampDate) dateMs = Date.parse(`${stampDate}T12:00:00Z`);
    }
    messages.push({ text: text.trim(), sender, dateMs });
  }
  return messages;
}

/** Epoch (milli)seconds → YYYY-MM-DD calendar date, or null when unusable. */
export function stampToDate(dateMs: number | null): string | null {
  if (dateMs == null || !Number.isFinite(dateMs) || dateMs <= 0) return null;
  const ms = dateMs > 1_000_000_000_000 ? dateMs : dateMs * 1000;
  const msSafe = Number.isFinite(ms) && ms > 0 ? ms : null;
  return msSafe != null ? new Date(msSafe).toISOString().slice(0, 10) : null;
}

/** Inclusive YYYY-MM-DD range check; open bounds are unbounded. */
export function withinRange(date: string, from?: string | null, to?: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function chunksOf<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** A batch decision doc: the receipt id and its staging timestamp. */
export type BatchDecisionDoc = { id: string; createdAt?: string | null };

/** Stable processing-order key: creation time first, then receipt id. */
export function batchDecisionKey(doc: BatchDecisionDoc): string {
  return `${doc.createdAt ?? ''}~${doc.id}`;
}

/**
 * Window of batch docs to decide in one callable call. Positioning is based
 * on the order key (never the list index), so already-visited docs — decided
 * or permanently blocked — are excluded even when they were deleted between
 * calls: a window of blocked messages can hold its ground only once and can
 * never starve the queue behind it. `nextCursor` feeds the next call;
 * `hasMore` is false once the collection end is reached.
 */
export function batchDecisionWindow<T extends BatchDecisionDoc>(
  docs: T[],
  cursor: string | null,
  maxItems: number,
): { slice: T[]; nextCursor: string | null; hasMore: boolean } {
  const order = (left: T, right: T) => {
    const leftKey = batchDecisionKey(left);
    const rightKey = batchDecisionKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  };
  const sorted = [...docs].sort(order);
  const start = cursor
    ? sorted.findIndex((doc) => batchDecisionKey(doc) > cursor)
    : 0;
  const first = start === -1 ? sorted.length : start;
  const slice = sorted.slice(first, first + maxItems);
  const nextCursor = slice.length > 0
    ? batchDecisionKey(slice[slice.length - 1])
    : cursor;
  const visitedEnd = first + slice.length;
  return { slice, nextCursor: nextCursor ?? null, hasMore: visitedEnd < sorted.length };
}
