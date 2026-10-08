import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { MessageTemplate } from '@kippa/domain';
import {
  MESSAGE_TEMPLATE_LIMITS,
  applyMessageTemplate,
  matchMessageTemplates,
  validateMessageTemplate,
} from '../../domain/message-ingestion/messageTemplates.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

/** Active user templates for one household (used by ingestion + history import). */
export async function loadActiveMessageTemplates(householdId: string): Promise<MessageTemplate[]> {
  const snap = await getFirestore()
    .collection(`households/${householdId}/messageTemplates`)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map((doc) => ({ ...(doc.data() as MessageTemplate), id: doc.id }));
}

/** Resolves a message against the household's templates when the parser gave up. */
export async function resolveTemplateMatch(
  householdId: string,
  messageText: string,
  todayIso: string,
) {
  const templates = await loadActiveMessageTemplates(householdId);
  if (templates.length === 0) return null;
  return matchMessageTemplates(messageText, templates, todayIso);
}

/**
 * Resolves a message against templates flagged `overrideBuiltIn` only — these
 * run BEFORE the built-in bank regexes so an edited copy of a predefined rule
 * takes precedence over the stock behavior.
 */
export async function resolveOverrideTemplateMatch(
  householdId: string,
  messageText: string,
  todayIso: string,
) {
  const templates = (await loadActiveMessageTemplates(householdId)).filter(
    (template) => template.overrideBuiltIn === true,
  );
  if (templates.length === 0) return null;
  return matchMessageTemplates(messageText, templates, todayIso);
}

/**
 * The web client nests the template fields under `template` alongside
 * action/templateId; payloads with the fields spread at the top level are
 * still accepted. Unwrap, then validate.
 */
export function resolveMessageTemplateInput(data: Record<string, unknown>) {
  return validateMessageTemplate((data.template ?? data) as Record<string, unknown>);
}

/** Lists / creates / edits / removes user-defined regex message templates. */
export const upsertMessageTemplate = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as Record<string, unknown>;
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const action = data.action;
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  if (action !== 'create' && action !== 'edit' && action !== 'remove') {
    throw new HttpsError('invalid-argument', 'action must be create, edit or remove.');
  }
  const caller = await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();
  const now = new Date().toISOString();
  if (action === 'remove') {
    const templateId = typeof data.templateId === 'string' ? data.templateId.trim() : '';
    if (!templateId) throw new HttpsError('invalid-argument', 'templateId is required.');
    await db.doc(`households/${householdId}/messageTemplates/${templateId}`).delete();
    return { templateId };
  }

  const input = (() => {
    const result = resolveMessageTemplateInput(data);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();

  if (action === 'create') {
    const activeCount = (await db.collection(`households/${householdId}/messageTemplates`).get()).size;
    if (activeCount >= MESSAGE_TEMPLATE_LIMITS.maxPerHousehold) {
      throw new HttpsError('failed-precondition', 'Too many templates — remove one first.');
    }
    const templateId = `mtpl_${crypto.randomUUID()}`;
    const template: MessageTemplate = {
      id: templateId, householdId, ...input,
      createdBy: uid, createdAt: now, updatedAt: now,
    };
    await db.doc(`households/${householdId}/messageTemplates/${templateId}`).set(template);
    return { templateId };
  }

  const templateId = typeof data.templateId === 'string' ? data.templateId.trim() : '';
  if (!templateId) throw new HttpsError('invalid-argument', 'templateId is required.');
  const templateRef = db.doc(`households/${householdId}/messageTemplates/${templateId}`);
  const existing = await templateRef.get();
  if (!existing.exists) throw new HttpsError('not-found', 'Template not found.');
  await templateRef.update({ ...input, updatedAt: now });
  void caller;
  return { templateId };
});

/** Runs a draft template (or a saved one) against a sample message — powers the live tester. */
export const testMessageTemplate = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as Record<string, unknown>;
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const sample = typeof data.sample === 'string' ? data.sample : '';
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  await requireFullHouseholdMember(uid, householdId);
  if (!sample.trim()) throw new HttpsError('invalid-argument', 'sample is required.');

  const todayIso = new Date().toISOString().slice(0, 10);
  const savedId = typeof data.templateId === 'string' ? data.templateId.trim() : '';
  if (savedId) {
    const snap = await getFirestore().doc(`households/${householdId}/messageTemplates/${savedId}`).get();
    const template = snap.data() as MessageTemplate | undefined;
    if (!template) throw new HttpsError('not-found', 'Template not found.');
    const match = applyMessageTemplate(sample, template, todayIso);
    return { matched: Boolean(match), match: match ?? null };
  }

  const input = (() => {
    const result = resolveMessageTemplateInput(data);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();
  const match = applyMessageTemplate(sample, { id: 'draft', ...input }, todayIso);
  return { matched: Boolean(match), match: match ?? null };
});
