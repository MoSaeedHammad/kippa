import { describe, expect, it } from 'vitest';
import { resolveCertificateInput } from './certificates.js';

/** The exact payload shape the web client sends (Certificates.tsx `save`). */
const nestedCreatePayload = {
  householdId: 'hh_1',
  action: 'create',
  certificate: {
    name: 'CIB 3y CD',
    bankId: 'cib',
    accountId: 'acc_1',
    principal: 100000,
    annualRatePct: 27,
    payoutFrequency: 'monthly',
    payoutAmount: 2250,
    startDate: '2026-10-08',
    maturityDate: null,
    categoryId: null,
    notes: null,
  },
};

describe('resolveCertificateInput', () => {
  it('validates the certificate nested under `certificate`, not the top-level payload', () => {
    const result = resolveCertificateInput(nestedCreatePayload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('CIB 3y CD');
    expect(result.value.principal).toBe(100000);
    expect(result.value.payoutAmount).toBe(2250);
  });

  it('still validates payloads with the fields spread at the top level', () => {
    const result = resolveCertificateInput({
      action: 'create',
      name: 'Spread CD',
      accountId: 'acc_1',
      principal: 5000,
      annualRatePct: 10,
      payoutFrequency: 'yearly',
      payoutAmount: 500,
      startDate: '2026-10-08',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Spread CD');
  });

  it('rejects a nested certificate with an empty name', () => {
    const result = resolveCertificateInput({
      ...nestedCreatePayload,
      certificate: { ...nestedCreatePayload.certificate, name: '   ' },
    });
    expect(result).toMatchObject({ ok: false, error: 'A certificate name is required.' });
  });
});
