type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Flattens nested JSON into dotted key paths, skipping arrays (plural suffixes are flat keys). */
export function flatten(obj: Json, prefix = ''): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return entries;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      entries.push(...flatten(v as { [key: string]: Json }, path));
    } else {
      entries.push([path, v]);
    }
  }
  return entries;
}
