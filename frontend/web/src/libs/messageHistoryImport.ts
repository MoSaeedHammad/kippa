/**
 * Client-side extraction of raw messages from phone history exports. Only the
 * container format is handled here — the server's bank-SMS parser decides
 * which messages are transactions.
 */

export type ExtractedMessage = {
  body: string;
  sender?: string;
  /** Message timestamp in epoch milliseconds, when the export carries one. */
  dateMs?: number;
};

export type MessageHistoryFormat = 'android-xml' | 'text';

/** Largest export file accepted by the import screen (100 MB). */
export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024;
/** Messages per importMessageHistory callable call. */
export const MESSAGES_PER_IMPORT_CALL = 200;

export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeFromCodePoint(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * Extracts the raw attribute string of every `<sms …>` element, scanning
 * char-by-char so `>` inside quoted attribute values cannot truncate the
 * element (exports of multi-line bodies rely on numeric entities, but raw
 * `>` is legal XML).
 */
function extractElementAttributes(xml: string, tag: string): string[] {
  const attrsList: string[] = [];
  const pattern = new RegExp(`<${tag}\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    let index = match.index + match[0].length;
    let attrs = '';
    while (index < xml.length) {
      const char = xml[index];
      if (char === '"') {
        const end = xml.indexOf('"', index + 1);
        if (end === -1) {
          attrs += xml.slice(index);
          break;
        }
        attrs += xml.slice(index, end + 1);
        index = end + 1;
        continue;
      }
      if (char === '>') break;
      attrs += char;
      index++;
    }
    attrsList.push(attrs);
  }
  return attrsList;
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-zA-Z_][\w.:-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(raw)) !== null) {
    attributes[match[1]] = decodeXmlEntities(match[2]);
  }
  return attributes;
}

function parseReadableDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.replace(/ at /i, ' '));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

/**
 * Android "SMS Backup & Restore" XML exports: one `<sms …/>` element per
 * message with `address`, `date` (epoch ms), `readable_date` and `body`.
 */
export function parseSmsBackupXml(xml: string): ExtractedMessage[] {
  const messages: ExtractedMessage[] = [];
  for (const raw of extractElementAttributes(xml, 'sms')) {
    const attributes = parseAttributes(raw);
    const body = attributes.body?.trim();
    if (!body) continue;
    const epoch = Number(attributes.date);
    messages.push({
      body,
      sender: attributes.address?.trim() || undefined,
      dateMs: Number.isFinite(epoch) && epoch > 0
        ? epoch
        : parseReadableDate(attributes.readable_date),
    });
  }
  return messages;
}

type DateHeader = { length: number; dateMs: number; bracketed: boolean };

/** Accepted leading date formats: [DD/MM/YY, HH:MM], ISO-ish, DD-MM-YYYY HH:MM:SS -. */
const DATE_HEADER_PATTERNS: RegExp[] = [
  /^\[(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*/,
  /^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*/,
  /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]\s*/,
];

function matchDateHeader(line: string): DateHeader | null {
  for (const pattern of DATE_HEADER_PATTERNS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const [, first, second, third, hour, minute, second60] = match;
    let year: number;
    let day: number;
    let month: number;
    if (pattern === DATE_HEADER_PATTERNS[1]) {
      // ISO is fixed YYYY-MM-DD.
      year = Number(first);
      month = Number(second);
      day = Number(third);
    } else {
      year = Number(third) < 100 ? 2000 + Number(third) : Number(third);
      // Exports from DD/MM locales (the app's audience) put the day first;
      // swap only when the components prove MM/DD.
      day = Number(first);
      month = Number(second);
      if (month > 12 && day <= 12) [day, month] = [month, day];
    }
    const dateMs = Date.UTC(year, month - 1, day, Number(hour), Number(minute), Number(second60 ?? 0));
    if (!Number.isFinite(dateMs)) continue;
    return { length: match[0].length, dateMs, bracketed: pattern === DATE_HEADER_PATTERNS[0] };
  }
  return null;
}

/**
 * Plain-text exports (iPhone tools, manual paste): blocks starting with a
 * recognizable date header, an optional `Sender:` prefix, and continuation
 * lines until the next header. Text without any header becomes one message.
 */
export function parsePlainTextHistory(text: string): ExtractedMessage[] {
  const messages: ExtractedMessage[] = [];
  let current: { lines: string[]; sender?: string; dateMs?: number } | null = null;
  const flush = () => {
    const body = (current?.lines ?? []).join('\n').trim();
    if (body) {
      messages.push({ body, sender: current?.sender, dateMs: current?.dateMs });
    }
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const header = matchDateHeader(line);
    if (header) {
      flush();
      const rest = line.slice(header.length).trim();
      // Only chat-export headers (bracket style) carry a contact-name
      // prefix; dash/ISO exports hold raw SMS text where "From HSBC:" is
      // part of the body, not a sender.
      const senderMatch = header.bracketed ? rest.match(/^([^:]{1,64}):\s*/) : null;
      current = {
        lines: [senderMatch ? rest.slice(senderMatch[0].length) : rest],
        sender: senderMatch ? senderMatch[1].trim() : undefined,
        dateMs: header.dateMs,
      };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { lines: [line] };
    }
  }
  flush();
  return messages;
}

/** Detects the container format and extracts every message it can find. */
export function extractMessages(text: string, fileName = ''): { format: MessageHistoryFormat; messages: ExtractedMessage[] } {
  const content = text.replace(/^\uFEFF/, '');
  const looksXml = /<\s*sms\b/i.test(content) || /\.xml$/i.test(fileName);
  if (looksXml) {
    return { format: 'android-xml', messages: parseSmsBackupXml(content) };
  }
  return { format: 'text', messages: parsePlainTextHistory(content) };
}

function toIsoDate(messages: ExtractedMessage[]): string[] {
  return messages
    .map((message) => (message.dateMs && Number.isFinite(message.dateMs) ? new Date(message.dateMs).toISOString().slice(0, 10) : null))
    .filter((date): date is string => date != null)
    .sort();
}

/** The duration the export covers, as YYYY-MM-DD bounds (null when undated). */
export function extractDuration(messages: ExtractedMessage[]): { from: string | null; to: string | null } {
  const dates = toIsoDate(messages);
  return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

/**
 * Narrows the staged set to the chosen range. When a range is applied,
 * undated messages are excluded — their real date cannot be verified and the
 * parser would otherwise book them on the message body's date or today.
 */
export function filterByDuration(messages: ExtractedMessage[], from?: string | null, to?: string | null): ExtractedMessage[] {
  if (!from && !to) return messages;
  return messages.filter((message) => {
    if (!message.dateMs) return false;
    const date = new Date(message.dateMs).toISOString().slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

export function chunkMessages<T>(messages: T[], size = MESSAGES_PER_IMPORT_CALL): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < messages.length; index += size) {
    chunks.push(messages.slice(index, index + size));
  }
  return chunks;
}

/** Groups pending messages staged by history imports, newest batch first. */
export function groupImportedPending<T extends { id: string; importBatchId?: string | null; importedAt?: string | null; createdAt: string }>(
  pending: T[],
): { batchId: string; importedAt: string; items: T[] }[] {
  const batches = new Map<string, { batchId: string; importedAt: string; items: T[] }>();
  for (const item of pending) {
    if (!item.importBatchId) continue;
    let batch = batches.get(item.importBatchId);
    if (!batch) {
      batch = { batchId: item.importBatchId, importedAt: item.importedAt ?? item.createdAt, items: [] };
      batches.set(item.importBatchId, batch);
    }
    batch.items.push(item);
  }
  return [...batches.values()].sort((left, right) => right.importedAt.localeCompare(left.importedAt));
}

// ── Structured record imports (JSON) ────────────────────────────────────

export type ExtractedRecord = {
  kind: 'expense' | 'income' | 'transfer';
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  description?: string;
  /** Merchant or transfer person. */
  merchant?: string;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function recordString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function recordNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/**
 * Parses a personal JSON export of records: a bare array or
 * `{ records: […] }` / `{ transactions: […] }`, with tolerant key aliases
 * (`type|kind`, `note|label|description`, `person|payee|merchant`,
 * `account|fromAccount`, `toAccount|destinationAccount`, …). Unusable
 * entries are dropped — the server re-validates everything.
 */
export function parseRecordHistoryJson(text: string): ExtractedRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? ((parsed as Record<string, unknown>).records ?? (parsed as Record<string, unknown>).transactions)
      : null;
  if (!Array.isArray(list)) return [];
  const records: ExtractedRecord[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const kindRaw = recordString(record, ['kind', 'type'])?.toLowerCase() ?? 'expense';
    if (kindRaw !== 'expense' && kindRaw !== 'income' && kindRaw !== 'transfer') continue;
    const date = recordString(record, ['date']);
    if (!date || !ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) continue;
    const amount = recordNumber(record, ['amount', 'value']);
    if (amount == null || !(amount > 0)) continue;
    const currency = recordString(record, ['currency', 'currencyCode']);
    if (!currency || !/^[A-Za-z]{3}$/.test(currency)) continue;
    records.push({
      kind: kindRaw,
      date,
      amount: Math.round(amount * 100) / 100,
      currency: currency.toUpperCase(),
      ...(recordString(record, ['description', 'note', 'label']) ? { description: recordString(record, ['description', 'note', 'label']) } : {}),
      ...(recordString(record, ['merchant', 'counterparty', 'person', 'payee']) ? { merchant: recordString(record, ['merchant', 'counterparty', 'person', 'payee']) } : {}),
      ...(recordString(record, ['accountId', 'account', 'fromAccountId', 'fromAccount']) ? { accountId: recordString(record, ['accountId', 'account', 'fromAccountId', 'fromAccount']) } : {}),
      ...(recordString(record, ['destinationAccountId', 'toAccountId', 'toAccount', 'destinationAccount']) ? { destinationAccountId: recordString(record, ['destinationAccountId', 'toAccountId', 'toAccount', 'destinationAccount']) } : {}),
      ...(recordString(record, ['categoryId', 'category']) ? { categoryId: recordString(record, ['categoryId', 'category']) } : {}),
    });
  }
  return records;
}

/** Earliest/latest record dates, as YYYY-MM-DD bounds. */
export function extractRecordDuration(records: ExtractedRecord[]): { from: string | null; to: string | null } {
  const dates = records.map((record) => record.date).sort();
  return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

/** Narrows records to the inclusive YYYY-MM-DD range (records are always dated). */
export function filterRecordsByDuration(records: ExtractedRecord[], from?: string | null, to?: string | null): ExtractedRecord[] {
  if (!from && !to) return records;
  return records.filter((record) => {
    if (from && record.date < from) return false;
    if (to && record.date > to) return false;
    return true;
  });
}
