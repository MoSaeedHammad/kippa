import { describe, expect, it } from 'vitest';
import { resolveMessageTemplateInput } from './messageTemplates.js';

/** The exact payload shape the web client sends (MessageTemplatesCard `draft`). */
const nestedCreatePayload = {
  householdId: 'hh_1',
  action: 'create',
  template: {
    name: 'CIB purchase',
    pattern: 'CIB (?<amount>[\\d,]+)',
    kind: 'expense',
    amountGroup: 'amount',
    currencyGroup: null,
    currency: 'EGP',
    dateGroup: null,
    dateFormat: null,
    merchantGroup: null,
    last4Group: null,
    cardKind: null,
    bankId: 'cib',
    descriptionGroup: null,
    overrideBuiltIn: false,
    isActive: true,
  },
};

describe('resolveMessageTemplateInput', () => {
  it('validates the template nested under `template`, not the top-level payload', () => {
    const result = resolveMessageTemplateInput(nestedCreatePayload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('CIB purchase');
    expect(result.value.pattern).toBe('CIB (?<amount>[\\d,]+)');
    expect(result.value.overrideBuiltIn).toBe(false);
  });

  it('still validates payloads with the fields spread at the top level', () => {
    const result = resolveMessageTemplateInput({
      action: 'create',
      name: 'Flat template',
      pattern: 'total (?<amount>[\\d.]+)',
      kind: 'expense',
      amountGroup: 'amount',
      currency: 'EGP',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Flat template');
  });

  it('rejects a nested template with an empty name', () => {
    const result = resolveMessageTemplateInput({
      ...nestedCreatePayload,
      template: { ...nestedCreatePayload.template, name: '  ' },
    });
    expect(result).toMatchObject({ ok: false, error: 'A template name is required.' });
  });
});
