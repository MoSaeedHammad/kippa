import { describe, expect, it } from 'vitest';
import { availableYears, filterEntriesByPeriod } from './entryHistoryFilter';

describe('availableYears', () => {
  it('returns unique years descending', () => {
    expect(availableYears([{ date: '2026-03-05' }, { date: '2025-12-31' }, { date: '2026-01-02' }])).toEqual([2026, 2025]);
  });

  it('returns empty for no entries', () => {
    expect(availableYears([])).toEqual([]);
  });
});

describe('filterEntriesByPeriod', () => {
  const entries = [
    { id: 'a', date: '2026-03-05' },
    { id: 'b', date: '2026-02-14' },
    { id: 'c', date: '2025-03-05' },
  ];

  it('passes everything through on all/all', () => {
    expect(filterEntriesByPeriod(entries, { year: 'all', month: 'all' })).toHaveLength(3);
  });

  it('filters by year', () => {
    expect(filterEntriesByPeriod(entries, { year: 2026, month: 'all' }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('filters by year and month', () => {
    expect(filterEntriesByPeriod(entries, { year: 2026, month: 3 }).map((e) => e.id)).toEqual(['a']);
  });

  it('month without matching year yields nothing', () => {
    expect(filterEntriesByPeriod(entries, { year: 2025, month: 2 })).toEqual([]);
  });
});
