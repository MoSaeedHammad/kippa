import { describe, expect, it } from 'vitest';
import { APICallError } from 'ai';
import { classifyProviderError, msUntilNextPacificReset, repairKnownToolAlias, retryAfterMsFromError, selectContextMessages } from './assistant';

describe('assistant provider errors', () => {
  it('extracts a fractional Gemini retry delay', () => {
    expect(retryAfterMsFromError('Please retry in 32.759941285s.')).toBe(32760);
  });

  it('turns quota errors into a safe friendly cooldown', () => {
    const error = classifyProviderError(new Error('You exceeded your current quota. Please retry in 12.4s.'));
    expect(error.kind).toBe('rate-limit');
    expect(error.retryAfterMs).toBe(12400);
    expect(error.message).not.toContain('AI_APICallError');
    expect(error.message).not.toContain('billing');
  });

  it('distinguishes daily quota exhaustion from a temporary rate limit', () => {
    const error = new APICallError({ message: 'You exceeded your current quota.', url: 'https://example.invalid', requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }) });
    const classified = classifyProviderError(error, 'gemini');
    expect(classified.kind).toBe('quota');
    expect(classified.retryAfterMs).toBeGreaterThan(60_000);
    expect(classified.message).not.toContain('RESOURCE_EXHAUSTED');
  });

  it('calculates the next midnight Pacific reset across time zones', () => {
    expect(msUntilNextPacificReset(new Date('2026-08-02T12:00:00.000Z'))).toBe(19 * 60 * 60 * 1000);
  });

  it('repairs the known monthly-summary alias into a validated category period', () => {
    expect(repairKnownToolAlias('getMonthlySummary', '{}', new Date(2026, 7, 2))).toEqual({
      toolName: 'getCategoryPerformance',
      input: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-02' }),
    });
  });

  it('does not guess at unknown tool names', () => {
    expect(repairKnownToolAlias('deleteEverything', '{}')).toBeNull();
  });

  it('keeps the newest complete messages inside the context budget', () => {
    const messages = ['old message', 'middle message', 'new message'].map((content, index) => ({ id: String(index), householdId: 'h', conversationId: 'c', role: index % 2 ? 'assistant' as const : 'user' as const, content, createdAt: '' }));
    expect(selectContextMessages(messages, 25).map(message => message.content)).toEqual(['middle message', 'new message']);
  });
});
