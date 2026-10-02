import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { CategoryRule } from '@kippa/domain';
import {
  MAX_RULES_PER_HOUSEHOLD,
  validateCategoryPattern,
} from '../../domain/categories/categoryMatching.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

/**
 * Manages merchant-pattern rules that auto-assign categories to ingested
 * bank messages. Rules live in households/{id}/categoryRules and are
 * server-written only (client rules deny writes).
 */
export const upsertCategoryRule = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as {
    householdId?: unknown;
    action?: unknown;
    ruleId?: unknown;
    categoryId?: unknown;
    pattern?: unknown;
  };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const action = data.action;
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  if (action !== 'add' && action !== 'remove') {
    throw new HttpsError('invalid-argument', "action must be 'add' or 'remove'.");
  }
  await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();

  if (action === 'remove') {
    const ruleId = typeof data.ruleId === 'string' ? data.ruleId.trim() : '';
    if (!ruleId) throw new HttpsError('invalid-argument', 'ruleId is required.');
    const ref = db.doc(`households/${householdId}/categoryRules/${ruleId}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Rule not found.');
    await ref.delete();
    return { removed: true };
  }

  const pattern = (() => {
    const result = validateCategoryPattern(data.pattern);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();
  const categoryId = typeof data.categoryId === 'string' ? data.categoryId.trim() : '';
  if (!categoryId) throw new HttpsError('invalid-argument', 'categoryId is required.');

  const categorySnapshot = await db.doc(`households/${householdId}/categories/${categoryId}`).get();
  if (!categorySnapshot.exists) throw new HttpsError('not-found', 'Category not found.');
  if (!(categorySnapshot.data() as { isActive?: boolean }).isActive) {
    throw new HttpsError('failed-precondition', 'Choose an active category.');
  }

  const existing = await db.collection(`households/${householdId}/categoryRules`).get();
  const duplicate = existing.docs.find(
    (doc) => (doc.data() as CategoryRule).pattern.toLowerCase() === pattern.toLowerCase(),
  );
  if (duplicate) {
    throw new HttpsError('already-exists', `A rule for "${pattern}" already exists.`);
  }
  if (existing.size >= MAX_RULES_PER_HOUSEHOLD) {
    throw new HttpsError('failed-precondition', 'Too many rules — remove some first.');
  }

  const ruleId = `rule_${crypto.randomUUID()}`;
  const rule: CategoryRule = {
    id: ruleId,
    householdId,
    pattern,
    categoryId,
    createdBy: uid,
    createdAt: new Date().toISOString(),
  };
  await db.doc(`households/${householdId}/categoryRules/${ruleId}`).set(rule);
  return { ruleId };
});
