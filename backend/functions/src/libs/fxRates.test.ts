import { describe, expect, it } from 'vitest';
import { convertAtRate } from './fxRates.js';

describe('convertAtRate', () => {
  it('converts and rounds to cents', () => {
    expect(convertAtRate(90.9, 0.0632)).toBe(5.74);
    expect(convertAtRate(10, 0.333)).toBe(3.33);
    expect(convertAtRate(354, 1)).toBe(354);
  });
});
