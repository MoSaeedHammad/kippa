import { describe, expect, it } from 'vitest';
import { matchCategoryByPattern, validateCategoryPattern } from './categoryMatching.js';

const rules = [
  { pattern: 'BEANOS', categoryId: 'cat_coffee' },
  { pattern: 'talabat', categoryId: 'cat_food' },
  { pattern: 'salary', categoryId: 'cat_salary' },
];

describe('matchCategoryByPattern', () => {
  it('matches case-insensitively against description and counterparty', () => {
    expect(matchCategoryByPattern(rules, { description: 'FAWRY · Beanos', counterparty: null })).toBe('cat_coffee');
    expect(matchCategoryByPattern(rules, { description: 'payment', counterparty: 'TALABAT' })).toBe('cat_food');
    expect(matchCategoryByPattern(rules, { description: 'Monthly salary', counterparty: 'ACME' })).toBe('cat_salary');
  });

  it('returns null when nothing matches', () => {
    expect(matchCategoryByPattern(rules, { description: 'random', counterparty: 'x' })).toBeNull();
    expect(matchCategoryByPattern([], { description: 'BEANOS', counterparty: null })).toBeNull();
  });

  it('evaluates rules in order on overlapping matches', () => {
    const overlapping = [
      { pattern: 'bean', categoryId: 'first' },
      { pattern: 'beanos', categoryId: 'second' },
    ];
    expect(matchCategoryByPattern(overlapping, { description: 'BEANOS', counterparty: null })).toBe('first');
  });
});

describe('validateCategoryPattern', () => {
  it('accepts trimmed patterns within bounds', () => {
    expect(validateCategoryPattern('  talabat ')).toEqual({ ok: true, value: 'talabat' });
  });

  it('rejects too-short, too-long and multiline patterns', () => {
    expect(!validateCategoryPattern('a').ok).toBe(true);
    expect(!validateCategoryPattern('x'.repeat(61)).ok).toBe(true);
    expect(!validateCategoryPattern('a\nb').ok).toBe(true);
    expect(!validateCategoryPattern(42).ok).toBe(true);
  });
});
