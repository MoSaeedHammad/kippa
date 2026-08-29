import { describe, expect, it } from 'vitest';
import { extractMessage, extractSender } from './ingestBody.js';

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
