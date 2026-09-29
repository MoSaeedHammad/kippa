import type {
  RecurringFrequency,
  RecurringSharedEntryRule,
  SharedBalanceEntry,
  SharedBalanceEntryKind,
} from '@kippa/domain';
import { validateSharedBalanceEntryInput, type ValidationResult } from './sharedBalance.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(dateIso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateIso.split('-').map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Same day-of-month `months` later, clamped to the month's last day (31st → Feb 28/29). */
export function addMonthsClamped(dateIso: string, months: number): string {
  const { y, m, d } = parseIso(dateIso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, lastDay));
}

export function addDaysIso(dateIso: string, days: number): string {
  const time = new Date(`${dateIso}T12:00:00Z`).getTime() + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

export function addYearsClamped(dateIso: string, years: number): string {
  return addMonthsClamped(dateIso, years * 12);
}

/**
 * Occurrence dates the rule should have materialized, oldest first: the series
 * from anchorDate through todayIso (UTC), never earlier than resumedDate,
 * stopping at endDate (inclusive).
 */
export function seriesDatesUntil(
  rule: Pick<RecurringSharedEntryRule, 'anchorDate' | 'frequency' | 'endDate' | 'resumedDate'>,
  todayIso: string,
): string[] {
  const floor = rule.resumedDate && rule.resumedDate > rule.anchorDate ? rule.resumedDate : rule.anchorDate;
  const dates: string[] = [];
  let current = rule.anchorDate;
  let guard = 0;
  while (current <= todayIso && guard < 20_000) {
    guard += 1;
    if (current >= floor && (!rule.endDate || current <= rule.endDate)) dates.push(current);
    current =
      rule.frequency === 'weekly' ? addDaysIso(current, 7)
        : rule.frequency === 'monthly' ? addMonthsClamped(current, 1)
          : addYearsClamped(current, 1);
  }
  return dates;
}

/** Bounded window of due occurrence dates for one cron run, honoring maxOccurrences. */
export function dueOccurrenceDates(
  rule: Pick<
    RecurringSharedEntryRule,
    'anchorDate' | 'frequency' | 'endDate' | 'resumedDate' | 'maxOccurrences' | 'occurrencesCreated'
  >,
  todayIso: string,
  cap = 13,
): string[] {
  const dates = seriesDatesUntil(rule, todayIso);
  const remaining = rule.maxOccurrences != null
    ? Math.max(0, rule.maxOccurrences - rule.occurrencesCreated)
    : dates.length;
  return dates.slice(0, Math.min(cap, remaining));
}

/** Deterministic entry id — makes cron reruns idempotent. */
export function occurrenceEntryId(ruleId: string, dateIso: string): string {
  return `sb_rc_${ruleId}_${dateIso.replace(/-/g, '')}`;
}

export type NormalizedRecurringRuleInput = {
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  frequency: RecurringFrequency;
  anchorDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validates rule creation/edit input; entry validation covers the shared fields. */
export function validateRecurringRuleInput(
  raw: unknown,
  callerUid: string,
): ValidationResult<NormalizedRecurringRuleInput> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid request body.' };
  const frequency = raw.frequency;
  if (frequency !== 'weekly' && frequency !== 'monthly' && frequency !== 'yearly') {
    return { ok: false, error: 'frequency must be weekly, monthly or yearly.' };
  }
  const anchorDate = typeof raw.anchorDate === 'string' ? raw.anchorDate.trim() : '';
  if (!ISO_DATE.test(anchorDate) || Number.isNaN(new Date(`${anchorDate}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'anchorDate must be a YYYY-MM-DD calendar date.' };
  }
  let endDate: string | null = null;
  if (raw.endDate != null) {
    if (typeof raw.endDate !== 'string' || !ISO_DATE.test(raw.endDate)) {
      return { ok: false, error: 'endDate must be a YYYY-MM-DD calendar date.' };
    }
    if (raw.endDate < anchorDate) return { ok: false, error: 'endDate cannot be before the anchor date.' };
    endDate = raw.endDate;
  }
  let maxOccurrences: number | null = null;
  if (raw.maxOccurrences != null) {
    if (
      typeof raw.maxOccurrences !== 'number'
      || !Number.isInteger(raw.maxOccurrences)
      || raw.maxOccurrences < 1
      || raw.maxOccurrences > 1000
    ) {
      return { ok: false, error: 'maxOccurrences must be an integer between 1 and 1000.' };
    }
    maxOccurrences = raw.maxOccurrences;
  }
  const entryResult = validateSharedBalanceEntryInput({ ...raw, date: anchorDate }, callerUid, anchorDate);
  if (!entryResult.ok) return entryResult;
  const { kind, fromUid, toUid, amount, currency, typeLabel, note } = entryResult.value;
  return {
    ok: true,
    value: { kind, fromUid, toUid, amount, currency, typeLabel, note, frequency, anchorDate, endDate, maxOccurrences },
  };
}

export type SharedBalanceEntrySeed = {
  id: string;
  householdId: string;
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  date: string;
  createdBy: string;
  authorDisplayName: string;
  counterpartyDisplayName: string;
  recurringRuleId?: string | null;
  now: string;
};

/** Single builder for pending shared-balance entries (manual propose + recurring occurrences). */
export function buildSharedBalanceEntry(seed: SharedBalanceEntrySeed): SharedBalanceEntry {
  const fromIsAuthor = seed.fromUid === seed.createdBy;
  return {
    id: seed.id,
    householdId: seed.householdId,
    kind: seed.kind,
    fromUid: seed.fromUid,
    toUid: seed.toUid,
    amount: seed.amount,
    currency: seed.currency,
    typeLabel: seed.typeLabel,
    note: seed.note,
    date: seed.date,
    status: 'pending',
    createdBy: seed.createdBy,
    revision: 1,
    mirrorTransactionId: null,
    sourceTransactionId: null,
    sourcePendingId: null,
    recurringRuleId: seed.recurringRuleId ?? null,
    fromDisplayName: fromIsAuthor ? seed.authorDisplayName : seed.counterpartyDisplayName,
    toDisplayName: fromIsAuthor ? seed.counterpartyDisplayName : seed.authorDisplayName,
    createdAt: seed.now,
    updatedAt: seed.now,
    decidedAt: null,
    decidedBy: null,
  };
}
