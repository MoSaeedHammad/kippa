import { describe, expect, it } from 'vitest';
import type { RecurringSharedEntryRule } from '@kippa/domain';
import { formatFrequencyPhrase, nextOccurrenceAfter, summarizeSharedAccounts } from './recurringSharedEntries';

function rule(overrides: Partial<RecurringSharedEntryRule>): RecurringSharedEntryRule {
  return {
    id: 'rsr_1',
    householdId: 'hh1',
    kind: 'iou',
    fromUid: 'user-a',
    toUid: 'user-b',
    amount: 500,
    currency: 'EGP',
    typeLabel: 'Rent',
    note: null,
    frequency: 'monthly',
    anchorDate: '2026-01-05',
    endDate: null,
    maxOccurrences: null,
    status: 'active',
    createdBy: 'user-a',
    occurrencesCreated: 1,
    lastOccurrenceDate: '2026-01-05',
    resumedDate: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('formatFrequencyPhrase', () => {
  it('formats monthly with an ordinal day', () => {
    expect(formatFrequencyPhrase(rule({ anchorDate: '2026-03-05' }))).toBe('Monthly on the 5th');
    expect(formatFrequencyPhrase(rule({ anchorDate: '2026-03-21' }))).toBe('Monthly on the 21st');
    expect(formatFrequencyPhrase(rule({ anchorDate: '2026-03-02' }))).toBe('Monthly on the 2nd');
  });

  it('formats weekly with the weekday name', () => {
    expect(formatFrequencyPhrase(rule({ frequency: 'weekly', anchorDate: '2026-03-05' }))).toBe('Every Thursday');
  });

  it('formats yearly with day and month', () => {
    expect(formatFrequencyPhrase(rule({ frequency: 'yearly', anchorDate: '2026-03-05' }))).toBe('Every year on 5 Mar');
  });
});

describe('nextOccurrenceAfter', () => {
  it('finds the next monthly date, clamped in short months', () => {
    expect(nextOccurrenceAfter(rule({ anchorDate: '2026-01-31' }), '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrenceAfter(rule({ anchorDate: '2026-01-05' }), '2026-03-05')).toBe('2026-04-05');
  });

  it('returns null past endDate', () => {
    expect(nextOccurrenceAfter(rule({ endDate: '2026-02-05' }), '2026-02-05')).toBeNull();
  });

  it('returns null once maxOccurrences is exhausted', () => {
    expect(nextOccurrenceAfter(rule({ maxOccurrences: 2, occurrencesCreated: 2 }), '2026-01-05')).toBeNull();
  });
});

describe('summarizeSharedAccounts', () => {
  const household = (id: string, name: string) => ({ id, name, baseCurrency: 'EGP', createdAt: '', createdBy: 'user-a' });
  const entry = (overrides: Record<string, unknown>) => ({
    id: 'e', householdId: 'hh1', kind: 'iou', fromUid: 'user-a', toUid: 'user-b', amount: 10,
    currency: 'EGP', typeLabel: 'Cash', note: null, date: '2026-01-01', status: 'pending',
    createdBy: 'user-b', revision: 1, fromDisplayName: 'A', toDisplayName: 'B',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
  });

  it('computes balance, pending count and sorts by latest activity', () => {
    const summaries = summarizeSharedAccounts(
      [
        {
          household: household('hh2', 'Quiet'),
          entries: [entry({ id: 'e1', householdId: 'hh2', fromUid: 'user-b', amount: 100, status: 'approved' })],
          members: [],
        },
        {
          household: household('hh1', 'Busy'),
          entries: [
            entry({ id: 'e2', fromUid: 'user-b', amount: 50, status: 'pending', updatedAt: '2026-05-01T00:00:00Z' }),
            entry({ id: 'e3', fromUid: 'user-a', amount: 20, status: 'approved', updatedAt: '2026-04-01T00:00:00Z' }),
          ],
          members: [],
        },
      ],
      'user-a',
    );
    expect(summaries.map((s) => s.household.id)).toEqual(['hh1', 'hh2']);
    const busy = summaries[0];
    // Only approved entries count: e3 has the viewer as payer (+20); e2 is pending.
    expect(busy.balance).toBe(20);
    expect(busy.pendingForMe).toBe(1);
  });
});
