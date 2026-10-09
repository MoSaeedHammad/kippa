import { describe, expect, it } from 'vitest';
import {
  batchDecisionWindow,
  chunksOf,
  importReceiptKey,
  MAX_MESSAGES_PER_IMPORT,
  sanitizeHistoryMessages,
  stampToDate,
  withinRange,
} from './historyImport.js';

describe('importReceiptKey', () => {
  it('is stable for the same household and message', () => {
    expect(importReceiptKey('hh1', 'From HSBC: 01JAN26 Shop Purchase')).toBe(
      importReceiptKey('hh1', 'From HSBC: 01JAN26 Shop Purchase'),
    );
  });

  it('differs per household so spaces never collide', () => {
    expect(importReceiptKey('hh1', 'same text')).not.toBe(importReceiptKey('hh2', 'same text'));
  });

  it('differs per message', () => {
    expect(importReceiptKey('hh1', 'one')).not.toBe(importReceiptKey('hh1', 'two'));
  });

  it('normalizes whitespace like the webhook dedupe material', () => {
    expect(importReceiptKey('hh1', 'line one\n\tline  two')).toBe(importReceiptKey('hh1', 'line one line two'));
  });
});

describe('sanitizeHistoryMessages', () => {
  it('accepts the forwarder payload shape { text, sender }', () => {
    const messages = sanitizeHistoryMessages([
      { text: 'From HSBC: 01JAN26 Shop Purchase', sender: 'HSBC' },
    ]);
    expect(messages).toEqual([{ text: 'From HSBC: 01JAN26 Shop Purchase', sender: 'HSBC', dateMs: null }]);
  });

  it('auto-maps webhook body aliases and sender aliases', () => {
    const messages = sanitizeHistoryMessages([
      { body: 'via body', from: 'HSBC' },
      { message: 'via message', address: 'BANKMISR' },
      { sms: 'via sms', phone_number: '+2010' },
      { content: 'via content' },
    ]);
    expect(messages.map((message) => message.text)).toEqual(['via body', 'via message', 'via sms', 'via content']);
    expect(messages[0].sender).toBe('HSBC');
    expect(messages[1].sender).toBe('BANKMISR');
    expect(messages[2].sender).toBe('+2010');
  });

  it('resolves stamps from dateMs and webhook stamp keys', () => {
    const messages = sanitizeHistoryMessages([
      { text: 'a', dateMs: 1_767_225_600_000 },
      { text: 'b', dateMs: 1_451_606_400 },
      { text: 'c', receivedStamp: '1767225600000' },
      { text: 'd', timestamp: '2026-01-01T10:00:00Z' },
      { text: 'e', date: 1_767_225_600_000 },
    ]);
    expect(messages[0].dateMs).toBe(1_767_225_600_000);
    expect(messages[1].dateMs).toBe(1_451_606_400);
    expect(messages[2].dateMs).toBe(Date.parse('2026-01-01T12:00:00Z'));
    expect(messages[3].dateMs).toBe(Date.parse('2026-01-01T12:00:00Z'));
    expect(messages[4].dateMs).toBe(Date.parse('2026-01-01T12:00:00Z'));
  });

  it('rejects non-array input', () => {
    expect(() => sanitizeHistoryMessages('nope')).toThrow();
    expect(() => sanitizeHistoryMessages(null)).toThrow();
  });

  it('clamps fields and drops entries without a usable text', () => {
    const longSender = `+${'9'.repeat(80)}`;
    const messages = sanitizeHistoryMessages([
      { text: ' From HSBC: Purchase ', sender: longSender, dateMs: 1_767_225_600_000 },
      { text: '   ' },
      { sender: 'HSBC' },
      null,
      42,
      { text: 'keep' },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('From HSBC: Purchase');
    expect(messages[0].sender).toHaveLength(64);
    expect(messages[1]).toEqual({ text: 'keep', sender: '', dateMs: null });
  });

  it('caps the number of messages per call', () => {
    const flood = Array.from({ length: MAX_MESSAGES_PER_IMPORT + 50 }, () => ({ text: 'm' }));
    expect(sanitizeHistoryMessages(flood)).toHaveLength(MAX_MESSAGES_PER_IMPORT);
  });
});

describe('stampToDate', () => {
  it('converts epoch milliseconds', () => {
    expect(stampToDate(1_767_225_600_000)).toBe('2026-01-01');
  });

  it('tolerates epoch seconds', () => {
    expect(stampToDate(1_451_606_400)).toBe('2016-01-01');
  });

  it('returns null for unusable values', () => {
    expect(stampToDate(null)).toBeNull();
    expect(stampToDate(0)).toBeNull();
    expect(stampToDate(Number.NaN)).toBeNull();
  });
});

describe('withinRange', () => {
  it('is inclusive on both bounds', () => {
    expect(withinRange('2025-06-01', '2025-06-01', '2025-06-30')).toBe(true);
    expect(withinRange('2025-06-30', '2025-06-01', '2025-06-30')).toBe(true);
    expect(withinRange('2025-05-31', '2025-06-01', '2025-06-30')).toBe(false);
    expect(withinRange('2025-07-01', '2025-06-01', '2025-06-30')).toBe(false);
  });

  it('treats missing bounds as unbounded', () => {
    expect(withinRange('2020-01-01')).toBe(true);
    expect(withinRange('2020-01-01', null, '2021-01-01')).toBe(true);
    expect(withinRange('2030-01-01', '2021-01-01', null)).toBe(true);
  });
});

describe('chunksOf', () => {
  it('splits evenly and keeps the remainder', () => {
    expect(chunksOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty list for empty input', () => {
    expect(chunksOf([], 10)).toEqual([]);
  });
});

describe('batchDecisionWindow', () => {
  const doc = (id: string, createdAt: string) => ({ id, createdAt });

  it('returns the first window in (createdAt, id) order', () => {
    const docs = [doc('b', '2026-01-01'), doc('a', '2026-01-01'), doc('c', '2025-12-31')];
    const { slice, nextCursor, hasMore } = batchDecisionWindow(docs, null, 2);
    expect(slice.map((entry) => entry.id)).toEqual(['c', 'a']);
    expect(nextCursor).toBe('2026-01-01~a');
    expect(hasMore).toBe(true);
  });

  it('continues strictly after the cursor, skipping already-visited docs', () => {
    const docs = [doc('a', '2026-01-01'), doc('b', '2026-01-01'), doc('c', '2026-01-02')];
    const { slice, nextCursor, hasMore } = batchDecisionWindow(docs, '2026-01-01~a', 1);
    expect(slice.map((entry) => entry.id)).toEqual(['b']);
    expect(nextCursor).toBe('2026-01-01~b');
    expect(hasMore).toBe(true);
  });

  it('reports no more work once the collection end is reached', () => {
    const docs = [doc('a', '2026-01-01'), doc('b', '2026-01-02')];
    const first = batchDecisionWindow(docs, null, 1);
    expect(first.hasMore).toBe(true);
    const second = batchDecisionWindow(docs, first.nextCursor, 1);
    expect(second.slice.map((entry) => entry.id)).toEqual(['b']);
    expect(second.nextCursor).toBe('2026-01-02~b');
    expect(second.hasMore).toBe(false);
  });

  it('keeps advancing past a window of permanently blocked docs even after they are deleted', () => {
    // Regression for the starvation bug: 100 no-suggested-account messages
    // occupied the front of the window forever, so nothing behind them was
    // ever decided. Cursor order must be absolute (key-based), not positional,
    // so deleting the processed docs between calls cannot rewind the window.
    const blocked = Array.from({ length: 100 }, (_, index) => doc(`blocked${String(index).padStart(3, '0')}`, '2026-01-01'));
    const resolvable = Array.from({ length: 30 }, (_, index) => doc(`ok${String(index).padStart(3, '0')}`, '2026-01-02'));
    const remaining = [...blocked, ...resolvable];
    let cursor: string | null = null;
    const visited: string[] = [];
    for (let call = 0; call < 10; call++) {
      const { slice, nextCursor, hasMore } = batchDecisionWindow(remaining, cursor, 100);
      visited.push(...slice.map((entry) => entry.id));
      cursor = nextCursor;
      if (!hasMore) break;
    }
    // The blocked docs come back (they stay pending) but are never revisited;
    // every resolvable doc must have appeared in some window.
    for (const entry of resolvable) expect(visited).toContain(entry.id);
    expect(visited.filter((id) => id.startsWith('ok'))).toHaveLength(30);
    expect(visited.filter((id) => id.startsWith('blocked'))).toHaveLength(100);
  });

  it('returns an empty window and no more-work flag for a stale cursor at the end', () => {
    const docs = [doc('a', '2026-01-01')];
    const { slice, nextCursor, hasMore } = batchDecisionWindow(docs, '2026-01-01~a', 100);
    expect(slice).toEqual([]);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBe('2026-01-01~a');
  });

  it('sorts missing createdAt last and keeps ids unique within the same stamp', () => {
    const docs = [doc('a', '2026-01-01'), doc('b', null), doc('c', undefined)];
    const { slice } = batchDecisionWindow(docs, null, 10);
    expect(slice.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});
