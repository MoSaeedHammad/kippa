import { describe, expect, it } from 'vitest';
import type { MessageTemplate } from '@kippa/domain';
import {
  applyMessageTemplate,
  matchMessageTemplates,
  validateMessageTemplate,
} from './messageTemplates.js';

const base = {
  name: 'BM credit card charge',
  pattern: String.raw`بطاقة بنك مصر الائتمانية\s*\*+\s*(?<last4>\d{4})[،,]?\s*تم خصم مبلغ\s*(?:(?<currency>EGP|USD)\s*)?(?<amount>[\d,]+(?:\.\d{1,2})?)`,
  kind: 'expense' as const,
  amountGroup: 'amount',
  currencyGroup: 'currency',
  currency: null,
  dateGroup: null,
  dateFormat: null,
  merchantGroup: null,
  last4Group: 'last4',
  cardKind: 'credit' as const,
  bankId: 'banque-misr',
  descriptionGroup: null,
  isActive: true,
};

const sample = 'بطاقة بنك مصر الائتمانية **2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre بتاريخ 27/08/2026';

describe('validateMessageTemplate', () => {
  it('accepts a valid template', () => {
    const result = validateMessageTemplate(base as never);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid regex, missing currency and bad kinds', () => {
    expect(!validateMessageTemplate({ ...base, pattern: '(' } as never).ok).toBe(true);
    expect(!validateMessageTemplate({ ...base, currency: null, currencyGroup: null } as never).ok).toBe(true);
    expect(!validateMessageTemplate({ ...base, kind: 'adjustment' } as never).ok).toBe(true);
    expect(!validateMessageTemplate({ ...base, name: '' } as never).ok).toBe(true);
  });

  it('accepts and normalizes the overrideBuiltIn flag', () => {
    const overriding = validateMessageTemplate({ ...base, overrideBuiltIn: true } as never);
    expect(overriding.ok).toBe(true);
    if (overriding.ok) expect(overriding.value.overrideBuiltIn).toBe(true);
    const plain = validateMessageTemplate(base as never);
    expect(plain.ok).toBe(true);
    if (plain.ok) expect(plain.value.overrideBuiltIn).toBe(false);
  });
});

describe('applyMessageTemplate', () => {
  it('extracts amount, currency, last4 and kind from the Bank Misr message', () => {
    const match = applyMessageTemplate(sample, { id: 't1', ...base }, '2026-10-08');
    expect(match).not.toBeNull();
    expect(match!.parsed.amount).toBe(10);
    expect(match!.parsed.currency).toBe('EGP');
    expect(match!.parsed.accountHintLast4).toBe('2508');
    expect(match!.parsed.accountKind).toBe('credit-card');
    expect(match!.parsed.kind).toBe('expense');
    expect(match!.parsed.provider).toBe('banque-misr');
    expect(match!.templateName).toBe(base.name);
  });

  it('falls back to the template currency and today when groups are missing', () => {
    const match = applyMessageTemplate('salary 9,500 paid', {
      id: 't2', name: 'salary', pattern: String.raw`salary\s*(?<amount>[\d,]+)\s*paid`,
      kind: 'income', amountGroup: 'amount', currencyGroup: null, currency: 'USD',
      dateGroup: null, dateFormat: null, merchantGroup: null, last4Group: null,
      cardKind: null, bankId: null, descriptionGroup: null,
    }, '2026-10-08');
    expect(match!.parsed.currency).toBe('USD');
    expect(match!.parsed.amount).toBe(9500);
    expect(match!.parsed.date).toBe('2026-10-08');
    expect(match!.parsed.accountHintLast4).toBeUndefined();
  });

  it('parses dd/MM/yyyy date groups', () => {
    const match = applyMessageTemplate('charge 5 on 27/08/2026', {
      id: 't3', name: 'dated', pattern: String.raw`charge\s*(?<amount>\d+)\s*on\s*(?<date>\d{2}/\d{2}/\d{4})`,
      kind: 'expense', amountGroup: 'amount', currencyGroup: null, currency: 'EGP',
      dateGroup: 'date', dateFormat: 'dd/MM/yyyy', merchantGroup: null, last4Group: null,
      cardKind: null, bankId: null, descriptionGroup: null,
    }, '2026-10-08');
    expect(match!.parsed.date).toBe('2026-08-27');
  });

  it('parses day/month dates with the current year (dd/MM)', () => {
    const match = applyMessageTemplate('atm 15000 on 25/08', {
      id: 't4', name: 'atm', pattern: String.raw`atm\s*(?<amount>\d+)\s*on\s*(?<date>\d{2}/\d{2})`,
      kind: 'transfer', amountGroup: 'amount', currencyGroup: null, currency: 'EGP',
      dateGroup: 'date', dateFormat: 'dd/MM', merchantGroup: null, last4Group: null,
      cardKind: null, bankId: null, descriptionGroup: null,
    }, '2026-10-08');
    expect(match!.parsed.date).toBe(`2026-08-25`);
  });

  it('parses compact bank dates (ddMMMyy)', () => {
    const match = applyMessageTemplate('purchase 325 on 31JUL26', {
      id: 't5', name: 'hsbc', pattern: String.raw`purchase\s*(?<amount>\d+)\s*on\s*(?<date>\d{2}[A-Z]{3}\d{2})`,
      kind: 'expense', amountGroup: 'amount', currencyGroup: null, currency: 'EGP',
      dateGroup: 'date', dateFormat: 'ddMMMyy', merchantGroup: null, last4Group: null,
      cardKind: null, bankId: null, descriptionGroup: null,
    }, '2026-10-08');
    expect(match!.parsed.date).toBe('2026-07-31');
  });

  it('extracts the reference group into parsed.reference and the description', () => {
    const match = applyMessageTemplate(
      'credited 225.00 on 17-07-2026 from person314271@instapay with reference e33925a9',
      {
        id: 't6', name: 'IPN in', pattern: String.raw`credited\s*(?<amount>[\d.]+)\s*on\s*(?<date>\d{2}-\d{2}-\d{4})\s*from\s*(?<merchant>.+?)\s*with reference\s*(?<reference>[A-Za-z0-9]+)`,
        kind: 'income', amountGroup: 'amount', currencyGroup: null, currency: 'EGP',
        dateGroup: 'date', dateFormat: 'dd-MM-yyyy', merchantGroup: 'merchant', last4Group: null,
        cardKind: null, bankId: 'hsbc', descriptionGroup: null, referenceGroup: 'reference',
      },
      '2026-10-08',
    );
    expect(match!.parsed.counterparty).toBe('person314271@instapay');
    expect(match!.parsed.reference).toBe('e33925a9');
    expect(match!.parsed.description).toBe('person314271@instapay · ref e33925a9');
  });

  it('validates the reference group like the other named groups', () => {
    const ok = validateMessageTemplate({ ...base, referenceGroup: 'reference' } as never);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.referenceGroup).toBe('reference');
    const missing = validateMessageTemplate({ ...base, referenceGroup: 'reference' } as never);
    expect(missing.ok).toBe(true); // base pattern has no reference group but also no existingGroups check
    const invalid = validateMessageTemplate({ ...base, referenceGroup: '9bad' } as never);
    expect(invalid.ok).toBe(true);
    if (invalid.ok) expect(invalid.value.referenceGroup).toBeNull();
  });

  it('returns null when the pattern or amount does not fit', () => {
    expect(applyMessageTemplate('unrelated text', { id: 't1', ...base }, '2026-10-08')).toBeNull();
    expect(applyMessageTemplate('بطاقة بنك مصر الائتمانية **2508، تم خصم مبلغ EGP 0', { id: 't1', ...base }, '2026-10-08')).toBeNull();
  });
});

describe('matchMessageTemplates', () => {
  it('skips inactive templates and returns the first active match', () => {
    const templates = [
      { id: 'off', ...base, pattern: String.raw`nomatch`, isActive: false } as MessageTemplate,
      { id: 'on', ...base } as MessageTemplate,
    ];
    const match = matchMessageTemplates(sample, templates, '2026-10-08');
    expect(match?.templateId).toBe('on');
  });
});
