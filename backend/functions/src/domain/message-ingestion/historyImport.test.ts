import { describe, expect, it } from 'vitest';
import {
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
