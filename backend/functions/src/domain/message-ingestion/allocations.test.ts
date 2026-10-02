import { describe, expect, it } from 'vitest';
import { validateAccountAllocations } from './allocations.js';

describe('validateAccountAllocations', () => {
  it('accepts allocations summing to the message amount', () => {
    const result = validateAccountAllocations([
      { accountId: 'a', amount: 300 },
      { accountId: 'b', amount: 200.005 },
    ], 500);
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('rejects duplicates and wrong totals', () => {
    expect(!validateAccountAllocations([
      { accountId: 'a', amount: 250 }, { accountId: 'a', amount: 250 },
    ], 500).ok).toBe(true);
    expect(!validateAccountAllocations([{ accountId: 'a', amount: 400 }], 500).ok).toBe(true);
    expect(!validateAccountAllocations([{ accountId: 'a', amount: -5 }], 5).ok).toBe(true);
    expect(!validateAccountAllocations('nope', 500).ok).toBe(true);
  });
});
