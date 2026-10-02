const MESSAGE_KEYS = ['message', 'text', 'body', 'sms', 'content'] as const;

/**
 * Android forwarder apps post different JSON shapes (and sometimes plain-text
 * bodies). Accept the common field names so most apps work without a bridge.
 */
export function extractMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() ? body : null;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of MESSAGE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

const SENDER_KEYS = ['sender', 'from', 'phone_number', 'senderNumber', 'address'] as const;

/** Extracts the sending phone number under the field names forwarders actually use. */
export function extractSender(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  for (const key of SENDER_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 64);
    if (typeof value === 'number') return String(value).slice(0, 64);
  }
  return '';
}

const STAMP_KEYS = ['receivedStamp', 'sentStamp', 'received_at', 'receivedAt', 'timestamp', 'date'] as const;

/**
 * Extracts the SMS timestamp from forwarder payloads. Android gateway apps
 * send epoch milliseconds as strings (e.g. receivedStamp); other apps send
 * ISO strings. Returns a YYYY-MM-DD calendar date or null when unusable.
 */
export function extractSmsDate(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of STAMP_KEYS) {
    const value = record[key];
    let ms: number | null = null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 1_000_000_000_000) ms = value;
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 1_000_000_000_000) ms = numeric;
      else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) ms = parsed.getTime();
      }
    }
    if (ms != null) return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}
