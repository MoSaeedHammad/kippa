import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import type { CategoryRule } from '@kippa/domain';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

/** Merchant-pattern rules that auto-assign categories to ingested messages. */
export const categoryRulesLib = {
  async list(householdId: string): Promise<CategoryRule[]> {
    const items = await dbLib.getDocs(householdId, 'categoryRules') as CategoryRule[];
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async add(data: { householdId: string; categoryId: string; pattern: string }): Promise<string> {
    const callable = httpsCallable<
      { householdId: string; categoryId: string; pattern: string; action: 'add' },
      { ruleId: string }
    >(requireFunctions(), 'upsertCategoryRule');
    return (await callable({ ...data, action: 'add' })).data.ruleId;
  },

  async remove(householdId: string, ruleId: string): Promise<void> {
    const callable = httpsCallable<
      { householdId: string; action: 'remove'; ruleId: string },
      { removed: boolean }
    >(requireFunctions(), 'upsertCategoryRule');
    await callable({ householdId, action: 'remove', ruleId });
  },
};
