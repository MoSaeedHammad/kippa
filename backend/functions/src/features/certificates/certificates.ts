import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Account, Certificate, RecurringTransactionRule } from '@kippa/domain';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYOUT_FREQUENCIES: readonly Certificate['payoutFrequency'][] = ['weekly', 'monthly', 'yearly'];
/** Certificate payout cadence maps 1:1 onto the recurring engine. */
const RULE_FREQUENCY: Record<Certificate['payoutFrequency'], RecurringTransactionRule['frequency']> = {
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
};

/**
 * Validates the certificate form. The payout amount may be derived from the
 * rate client-side but is always supplied explicitly so the linked recurring
 * rule books a stable number.
 */
function validateCertificateInput(raw: Record<string, unknown>): { ok: true; value: {
  name: string; bankId: string | null; accountId: string; principal: number;
  annualRatePct: number; payoutFrequency: Certificate['payoutFrequency'];
  payoutAmount: number; startDate: string; maturityDate: string | null;
  categoryId: string | null; notes: string | null;
} } | { ok: false; error: string } {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return { ok: false, error: 'A certificate name is required.' };
  const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : '';
  if (!accountId) return { ok: false, error: 'Choose the account the interest pays into.' };
  const principal = raw.principal;
  if (typeof principal !== 'number' || !Number.isFinite(principal) || principal <= 0) {
    return { ok: false, error: 'The principal must be a positive number.' };
  }
  const annualRatePct = raw.annualRatePct;
  if (typeof annualRatePct !== 'number' || !Number.isFinite(annualRatePct) || annualRatePct < 0 || annualRatePct > 100) {
    return { ok: false, error: 'The annual rate must be between 0 and 100.' };
  }
  const payoutFrequency = raw.payoutFrequency;
  if (typeof payoutFrequency !== 'string' || !PAYOUT_FREQUENCIES.includes(payoutFrequency as Certificate['payoutFrequency'])) {
    return { ok: false, error: 'payoutFrequency must be weekly, monthly or yearly.' };
  }
  const payoutFrequencyValue = payoutFrequency as Certificate['payoutFrequency'];
  const payoutAmount = raw.payoutAmount;
  if (typeof payoutAmount !== 'number' || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return { ok: false, error: 'The payout amount must be a positive number.' };
  }
  const startDate = typeof raw.startDate === 'string' && ISO_DATE.test(raw.startDate) ? raw.startDate : '';
  if (!startDate) return { ok: false, error: 'startDate must be a YYYY-MM-DD calendar date.' };
  let maturityDate: string | null = null;
  if (typeof raw.maturityDate === 'string' && raw.maturityDate.trim()) {
    if (!ISO_DATE.test(raw.maturityDate) || raw.maturityDate < startDate) {
      return { ok: false, error: 'maturityDate must be a calendar date on or after startDate.' };
    }
    maturityDate = raw.maturityDate;
  }
  const categoryId = typeof raw.categoryId === 'string' && raw.categoryId.trim() ? raw.categoryId.trim() : null;
  const bankId = typeof raw.bankId === 'string' && raw.bankId.trim() ? raw.bankId.trim() : null;
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : null;
  return {
    ok: true,
    value: { name, bankId, accountId, principal, annualRatePct, payoutFrequency: payoutFrequencyValue, payoutAmount, startDate, maturityDate, categoryId, notes },
  };
}

/**
 * The web client nests the certificate fields under `certificate` alongside
 * action/certificateId; payloads with the fields spread at the top level are
 * still accepted. Unwrap, then validate.
 */
export function resolveCertificateInput(data: Record<string, unknown>) {
  return validateCertificateInput((data.certificate ?? data) as Record<string, unknown>);
}

/**
 * Creates / edits / redeems a deposit certificate with recurring interest
 * income. Creation also creates the linked recurring income rule so the daily
 * cron materializes each payout; redemption cancels it and freezes the
 * certificate at `status: 'redeemed'`.
 */
export const upsertCertificate = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as Record<string, unknown>;
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const action = data.action;
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  if (action !== 'create' && action !== 'edit' && action !== 'redeem') {
    throw new HttpsError('invalid-argument', 'action must be create, edit or redeem.');
  }
  const caller = await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();
  const now = new Date().toISOString();

  if (action === 'redeem') {
    const certificateId = typeof data.certificateId === 'string' ? data.certificateId.trim() : '';
    if (!certificateId) throw new HttpsError('invalid-argument', 'certificateId is required.');
    const ref = db.doc(`households/${householdId}/certificates/${certificateId}`);
    const snap = await ref.get();
    const certificate = snap.data() as Certificate | undefined;
    if (!certificate) throw new HttpsError('not-found', 'Certificate not found.');
    if (certificate.recurringRuleId) {
      await db.doc(`households/${householdId}/recurringTransactionRules/${certificate.recurringRuleId}`)
        .set({ status: 'cancelled', updatedAt: Date.now() }, { merge: true });
    }
    await ref.set({ status: 'redeemed', updatedAt: now }, { merge: true });
    await db.doc(`households/${householdId}/auditLog/certificate_redeemed_${certificateId}_${Date.now()}`).create({
      id: `certificate_redeemed_${certificateId}_${Date.now()}`,
      householdId,
      userId: uid,
      userDisplayName: caller.displayName || 'User',
      action: 'certificate_redeemed',
      summary: `${caller.displayName || 'User'} redeemed certificate "${certificate.name}" — payouts stopped`,
      details: { certificateId },
      createdAt: now,
    });
    return { certificateId };
  }

  const input = (() => {
    const result = resolveCertificateInput(data);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();

  const accountSnap = await db.doc(`households/${householdId}/accounts/${input.accountId}`).get();
  const account = accountSnap.data() as Account | undefined;
  if (!account?.isActive) throw new HttpsError('failed-precondition', 'Choose an active account.');
  if (input.categoryId) {
    const categorySnap = await db.doc(`households/${householdId}/categories/${input.categoryId}`).get();
    const category = categorySnap.data() as { isActive?: boolean; type?: string } | undefined;
    if (!category?.isActive || category.type !== 'income') {
      throw new HttpsError('failed-precondition', 'Choose an active income category.');
    }
  }

  const rulePayload = {
    type: 'income' as const,
    amount: input.payoutAmount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    merchant: input.bankId ?? 'Certificate',
    description: `${input.name} — interest payout`,
    frequency: RULE_FREQUENCY[input.payoutFrequency],
    anchorDate: input.startDate,
    endDate: input.maturityDate,
    maxOccurrences: null,
  };

  if (action === 'create') {
    const certificateId = `cert_${crypto.randomUUID()}`;
    const ruleId = `rtr_${crypto.randomUUID()}`;
    const rule: RecurringTransactionRule = {
      id: ruleId,
      householdId,
      ...rulePayload,
      destinationAccountId: null,
      destinationAmount: null,
      destinationCurrency: null,
      currency: account.currency,
      status: 'active',
      createdBy: uid,
      occurrencesCreated: 0,
      lastOccurrenceDate: null,
      resumedDate: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const certificate: Certificate = {
      id: certificateId,
      householdId,
      ...input,
      currency: account.currency,
      recurringRuleId: ruleId,
      status: 'active',
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    };
    const batch = db.batch();
    batch.set(db.doc(`households/${householdId}/recurringTransactionRules/${ruleId}`), rule);
    batch.set(db.doc(`households/${householdId}/certificates/${certificateId}`), certificate);
    batch.create(db.doc(`households/${householdId}/auditLog/certificate_created_${certificateId}`), {
      id: `certificate_created_${certificateId}`,
      householdId,
      userId: uid,
      userDisplayName: caller.displayName || 'User',
      action: 'certificate_created',
      summary: `${caller.displayName || 'User'} created certificate "${certificate.name}": ${principalLabel(certificate)} with ${input.payoutAmount} ${account.currency} ${input.payoutFrequency} payouts`,
      details: { certificateId, ruleId, accountId: input.accountId },
      createdAt: now,
    });
    await batch.commit();
    return { certificateId, ruleId };
  }

  // edit — update the certificate and keep the linked rule in step.
  const certificateId = typeof data.certificateId === 'string' ? data.certificateId.trim() : '';
  if (!certificateId) throw new HttpsError('invalid-argument', 'certificateId is required.');
  const ref = db.doc(`households/${householdId}/certificates/${certificateId}`);
  const snap = await ref.get();
  const existing = snap.data() as Certificate | undefined;
  if (!existing) throw new HttpsError('not-found', 'Certificate not found.');
  const updated: Certificate = { ...existing, ...input, currency: account.currency, updatedAt: now };
  await ref.set(updated);
  if (existing.recurringRuleId) {
    await db.doc(`households/${householdId}/recurringTransactionRules/${existing.recurringRuleId}`)
      .set({ ...rulePayload, currency: account.currency, destinationAccountId: null, destinationAmount: null, destinationCurrency: null, updatedAt: Date.now() }, { merge: true });
  }
  await db.doc(`households/${householdId}/auditLog/certificate_updated_${certificateId}_${Date.now()}`).create({
    id: `certificate_updated_${certificateId}_${Date.now()}`,
    householdId,
    userId: uid,
    userDisplayName: caller.displayName || 'User',
    action: 'certificate_updated',
    summary: `${caller.displayName || 'User'} updated certificate "${updated.name}"`,
    details: { certificateId },
    createdAt: now,
  });
  return { certificateId };
});

function principalLabel(certificate: Certificate): string {
  return `${certificate.principal} ${certificate.currency} @ ${certificate.annualRatePct}%`;
}
