export type EntryPeriodFilter = { year: number | 'all'; month: number | 'all' };

/** Unique years present in the items, newest first. */
export function availableYears<T extends { date: string }>(items: T[]): number[] {
  const years = new Set<number>();
  for (const item of items) {
    const year = Number(item.date.slice(0, 4));
    if (Number.isInteger(year) && year > 0) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/** Items whose entry date falls in the selected year/month; 'all' skips that axis. */
export function filterEntriesByPeriod<T extends { date: string }>(items: T[], filter: EntryPeriodFilter): T[] {
  return items.filter((item) => {
    if (filter.year !== 'all' && Number(item.date.slice(0, 4)) !== filter.year) return false;
    if (filter.month !== 'all' && Number(item.date.slice(5, 7)) !== filter.month) return false;
    return true;
  });
}
