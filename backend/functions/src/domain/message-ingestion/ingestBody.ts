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

export function extractSender(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>).sender;
  return typeof value === 'string' ? value.trim().slice(0, 64) : '';
}
