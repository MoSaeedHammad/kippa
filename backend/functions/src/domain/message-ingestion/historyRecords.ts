import { createHash } from 'node:crypto';

/** Per-callable-call cap, mirroring the message history import. */
export const MAX_RECORDS_PER_IMPORT = 1000;

export type HistoryRecordKind = 'expense' | 'income' | 'transfer';

export type SanitizedHistoryRecord = {
  /** Canonical dedupe material — stable for the same logical record. */
  canonical: string;
  kind: HistoryRecordKind;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  description: string | null;
  /** Merchant or transfer person. */
  counterparty: string | null;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Validates and normalizes client-supplied record objects with tolerant keys,
 * so a personal export in any reasonable shape imports: `kind|type`,
 * `date`, `amount`, `currency`, `description|note|label`,
 * `merchant|counterparty|person|payee`, `accountId|account`,
 * `destinationAccountId|toAccount`, `categoryId|category`. Unusable entries
 * are dropped; only structural problems throw.
 */
export function sanitizeHistoryRecords(input: unknown): SanitizedHistoryRecord[] {
  if (!Array.isArray(input)) throw new TypeError('records must be an array.');
  const records: SanitizedHistoryRecord[] = [];
  for (const entry of input.slice(0, MAX_RECORDS_PER_IMPORT)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;

    const kindRaw = firstString(record, ['kind', 'type'])?.toLowerCase() ?? 'expense';
    if (kindRaw !== 'expense' && kindRaw !== 'income' && kindRaw !== 'transfer') continue;
    const kind: HistoryRecordKind = kindRaw;

    const date = firstString(record, ['date']) ?? '';
    if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) continue;

    const amount = firstNumber(record, ['amount', 'value']);
    if (amount == null || !(amount > 0)) continue;

    const currency = firstString(record, ['currency', 'currencyCode']);
    if (!currency || !/^[A-Za-z]{3}$/.test(currency)) continue;

    const amountSafe = Math.round(amount * 100) / 100;
    const description = firstString(record, ['description', 'note', 'label'])?.slice(0, 300) ?? null;
    const counterparty = firstString(record, ['merchant', 'counterparty', 'person', 'payee'])?.slice(0, 200) ?? null;
    const accountId = firstString(record, ['accountId', 'account', 'fromAccountId', 'fromAccount']);
    const destinationAccountId = firstString(record, ['destinationAccountId', 'toAccountId', 'toAccount', 'destinationAccount']);
    const categoryId = firstString(record, ['categoryId', 'category']);

    const canonical = [kind, date, amountSafe, currency.toUpperCase(), description ?? '', accountId ?? '', destinationAccountId ?? ''].join('|');
    records.push({
      canonical,
      kind,
      date,
      amount: amountSafe,
      currency: currency.toUpperCase(),
      description,
      counterparty,
      accountId: accountId ?? null,
      destinationAccountId: destinationAccountId ?? null,
      categoryId: kind === 'transfer' ? null : (categoryId ?? null),
    });
  }
  return records;
}

/**
 * Receipt id for record imports: per household, stable for the same logical
 * record, so re-importing the same JSON is a no-op even if descriptions or
 * merchants were edited slightly.
 */
export function recordReceiptKey(householdId: string, canonical: string): string {
  return createHash('sha256').update(`history-records_${householdId}\0${canonical}`).digest('hex');
}
