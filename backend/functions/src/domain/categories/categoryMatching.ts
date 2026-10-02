import type { CategoryRule } from '@kippa/domain';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const MIN_PATTERN_LENGTH = 2;
export const MAX_PATTERN_LENGTH = 60;
export const MAX_RULES_PER_HOUSEHOLD = 200;

/**
 * Returns the category id of the first rule whose pattern matches the
 * message text (case-insensitive substring against description and
 * counterparty). Rules are evaluated in the order given (creation order).
 */
export function matchCategoryByPattern(
  rules: Pick<CategoryRule, 'pattern' | 'categoryId'>[],
  messageText: { description: string; counterparty?: string | null },
): string | null {
  const haystack = `${messageText.description}\n${messageText.counterparty ?? ''}`.toLowerCase();
  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();
    if (pattern && haystack.includes(pattern)) return rule.categoryId;
  }
  return null;
}

export function validateCategoryPattern(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') return { ok: false, error: 'pattern must be a string.' };
  const pattern = raw.trim();
  if (pattern.length < MIN_PATTERN_LENGTH) return { ok: false, error: `pattern must be at least ${MIN_PATTERN_LENGTH} characters.` };
  if (pattern.length > MAX_PATTERN_LENGTH) return { ok: false, error: `pattern must be at most ${MAX_PATTERN_LENGTH} characters.` };
  if (pattern.includes('\n')) return { ok: false, error: 'pattern must be a single line.' };
  return { ok: true, value: pattern };
}
