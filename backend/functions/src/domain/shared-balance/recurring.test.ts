import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  addYearsClamped,
  buildSharedBalanceEntry,
  dueOccurrenceDates,
  occurrenceEntryId,
  seriesDatesUntil,
  validateRecurringRuleInput,
} from './recurring.js';

const BASE_RULE = {
  anchorDate: '2026-01-05',
  frequency: 'monthly',
  endDate: null,
  resumedDate: null,
  maxOccurrences: null,
  occurrencesCreated: 0,
} as const;

describe('addMonthsClamped', () => {
  it('clamps to the last day of short months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('handles leap years', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addYearsClamped('2024-02-29', 1)).toBe('2025-02-28');
  });

  it('rolls across year boundaries', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('seriesDatesUntil', () => {
  it('generates monthly occurrences including the anchor', () => {
    const dates = seriesDatesUntil(BASE_RULE, '2026-03-20');
    expect(dates).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('returns nothing for a future anchor', () => {
    expect(seriesDatesUntil(BASE_RULE, '2026-01-04')).toEqual([]);
  });

  it('stops at endDate (inclusive)', () => {
    const dates = seriesDatesUntil({ ...BASE_RULE, endDate: '2026-02-05' }, '2026-06-01');
    expect(dates).toEqual(['2026-01-05', '2026-02-05']);
  });

  it('never backfills before resumedDate', () => {
    const dates = seriesDatesUntil({ ...BASE_RULE, resumedDate: '2026-03-01' }, '2026-04-20');
    expect(dates).toEqual(['2026-03-05', '2026-04-05']);
  });

  it('steps weekly from the anchor', () => {
    const dates = seriesDatesUntil({ ...BASE_RULE, frequency: 'weekly', anchorDate: '2026-03-02' }, '2026-03-16');
    expect(dates).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });

  it('repeats yearly on the same month-day', () => {
    const dates = seriesDatesUntil({ ...BASE_RULE, frequency: 'yearly', anchorDate: '2024-02-29' }, '2026-03-01');
    expect(dates).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });
});

describe('dueOccurrenceDates', () => {
  it('caps the backfill window per run, oldest first', () => {
    const dates = dueOccurrenceDates(
      { ...BASE_RULE, anchorDate: '2024-01-05' },
      '2026-09-29',
      13,
    );
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe('2024-01-05');
    expect(dates[12]).toBe('2025-01-05');
  });

  it('honors maxOccurrences minus already-created occurrences', () => {
    const dates = dueOccurrenceDates(
      { ...BASE_RULE, maxOccurrences: 4, occurrencesCreated: 3 },
      '2026-09-29',
      13,
    );
    expect(dates).toEqual(['2026-01-05']);
  });

  it('returns nothing once maxOccurrences is exhausted', () => {
    const dates = dueOccurrenceDates(
      { ...BASE_RULE, maxOccurrences: 2, occurrencesCreated: 2 },
      '2026-09-29',
      13,
    );
    expect(dates).toEqual([]);
  });
});

describe('occurrenceEntryId', () => {
  it('is deterministic per rule and date', () => {
    expect(occurrenceEntryId('rsr_abc', '2026-03-05')).toBe('sb_rc_rsr_abc_20260305');
    expect(occurrenceEntryId('rsr_abc', '2026-03-05')).toBe(occurrenceEntryId('rsr_abc', '2026-03-05'));
    expect(occurrenceEntryId('rsr_abc', '2026-03-06')).not.toBe(occurrenceEntryId('rsr_abc', '2026-03-05'));
  });
});

describe('validateRecurringRuleInput', () => {
  const valid = {
    kind: 'iou',
    direction: 'caller_paid',
    counterpartyUid: 'user-b',
    amount: 500,
    currency: 'EGP',
    typeLabel: 'Rent',
    note: null,
    frequency: 'monthly',
    anchorDate: '2026-01-05',
  };

  it('accepts a valid rule and maps direction to from/to', () => {
    const result = validateRecurringRuleInput(valid, 'user-a');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fromUid).toBe('user-a');
      expect(result.value.toUid).toBe('user-b');
      expect(result.value.frequency).toBe('monthly');
      expect(result.value.endDate).toBeNull();
      expect(result.value.maxOccurrences).toBeNull();
    }
  });

  it('rejects an invalid frequency', () => {
    const result = validateRecurringRuleInput({ ...valid, frequency: 'daily' }, 'user-a');
    expect(result).toEqual({ ok: false, error: 'frequency must be weekly, monthly or yearly.' });
  });

  it('rejects endDate before anchorDate', () => {
    const result = validateRecurringRuleInput({ ...valid, endDate: '2025-12-31' }, 'user-a');
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range maxOccurrences', () => {
    expect(validateRecurringRuleInput({ ...valid, maxOccurrences: 0 }, 'user-a').ok).toBe(false);
    expect(validateRecurringRuleInput({ ...valid, maxOccurrences: 1001 }, 'user-a').ok).toBe(false);
    expect(validateRecurringRuleInput({ ...valid, maxOccurrences: 1.5 }, 'user-a').ok).toBe(false);
  });

  it('rejects a self counterparty via entry validation', () => {
    const result = validateRecurringRuleInput({ ...valid, counterpartyUid: 'user-a' }, 'user-a');
    expect(result.ok).toBe(false);
  });

  it('rejects a bad anchor date', () => {
    const result = validateRecurringRuleInput({ ...valid, anchorDate: '2026-13-40' }, 'user-a');
    expect(result.ok).toBe(false);
  });
});

describe('buildSharedBalanceEntry', () => {
  it('builds a pending entry with display names and rule link', () => {
    const entry = buildSharedBalanceEntry({
      id: 'sb_rc_r1_20260305',
      householdId: 'hh1',
      kind: 'iou',
      fromUid: 'user-b',
      toUid: 'user-a',
      amount: 500,
      currency: 'EGP',
      typeLabel: 'Rent',
      note: null,
      date: '2026-03-05',
      createdBy: 'user-a',
      authorDisplayName: 'Alice',
      counterpartyDisplayName: 'Bob',
      recurringRuleId: 'rsr_1',
      now: '2026-03-05T00:30:00.000Z',
    });
    expect(entry.status).toBe('pending');
    expect(entry.revision).toBe(1);
    expect(entry.recurringRuleId).toBe('rsr_1');
    expect(entry.fromDisplayName).toBe('Bob');
    expect(entry.toDisplayName).toBe('Alice');
    expect(entry.mirrorTransactionId).toBeNull();
    expect(entry.decidedAt).toBeNull();
  });
});
