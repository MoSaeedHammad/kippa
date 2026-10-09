const TIMEOUT_MS = 5_000;

async function fetchFrankfurter(from: string, to: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    const rate = data?.rates?.[to];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

async function fetchErApi(from: string, to: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${from}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    const rate = data?.rates?.[to];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Live mid-market FX rate from the same sources the web app uses
 * (Frankfurter, then open.er-api.com). Null when both are unreachable —
 * callers decide whether to fall back or skip; never assume a rate.
 */
export async function fetchFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  return (await fetchFrankfurter(from, to)) ?? (await fetchErApi(from, to));
}

/** Settled amount in the account currency, rounded to cents. */
export function convertAtRate(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
