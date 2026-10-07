import type { FinanceTransaction } from '@kippa/domain';

export type EntryType = 'quick' | 'ingested' | 'imported';

/**
 * How a transaction entered the ledger: typed by hand (quick), approved from
 * a live bank message (ingested), or approved from a bulk history import of
 * messages or JSON records (imported). Derived from the audit marker the
 * approval flow writes; never stored as its own field.
 */
export function entryTypeOf(transaction: Pick<FinanceTransaction, 'importedFrom'>): EntryType {
  if (!transaction.importedFrom) return 'quick';
  return transaction.importedFrom.source.startsWith('import') ? 'imported' : 'ingested';
}
