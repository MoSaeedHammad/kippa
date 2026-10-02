import { describe, expect, it } from 'vitest';
import { extractMessage, extractSender, extractSmsDate } from './ingestBody.js';

describe('extractMessage', () => {
  it('reads the canonical message field', () => {
    expect(extractMessage({ message: ' From HSBC ' })).toBe(' From HSBC ');
  });

  it('falls back through forwarder field names', () => {
    expect(extractMessage({ text: 'sms body' })).toBe('sms body');
    expect(extractMessage({ body: 'sms body' })).toBe('sms body');
    expect(extractMessage({ sms: 'sms body' })).toBe('sms body');
    expect(extractMessage({ content: 'sms body' })).toBe('sms body');
    expect(extractMessage({})).toBeNull();
    expect(extractMessage({ message: '   ' })).toBeNull();
  });

  it('accepts a raw text body', () => {
    expect(extractMessage('raw sms')).toBe('raw sms');
  });
});

describe('extractSender', () => {
  it('returns a trimmed bounded sender', () => {
    expect(extractSender({ sender: ' BankMisr ' })).toBe('BankMisr');
    expect(extractSender({})).toBe('');
    expect(extractSender('raw string body')).toBe('');
  });
});

describe('extractSender (gateway payload shapes)', () => {
  it('reads the android gateway "from" field', () => {
    expect(extractSender({ from: '+201001234567', text: 'hi' })).toBe('+201001234567');
  });
  it('keeps supporting the sender key', () => {
    expect(extractSender({ sender: 'BANK' })).toBe('BANK');
  });
});

describe('extractSmsDate', () => {
  it('parses receivedStamp epoch-millis strings', () => {
    expect(extractSmsDate({ receivedStamp: '1790805959000' })).toBe('2026-09-30');
  });
  it('parses ISO stamps and falls back to sentStamp', () => {
    expect(extractSmsDate({ receivedStamp: '', sentStamp: '2026-10-01T12:00:00Z' })).toBe('2026-10-01');
  });
  it('returns null without usable stamps', () => {
    expect(extractSmsDate({ text: 'hi' })).toBeNull();
  });
});
