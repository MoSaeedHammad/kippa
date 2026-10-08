/* One-off analysis of pending financial messages that stay unapproved (read-only).
 * Shows which blocking condition applies to each remaining pending doc.
 * Usage: node scripts/analyze-pending-blockers.mjs
 */
const PROJECT = 'kippa-1787921674';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;

async function accessToken() {
  const { execSync } = await import('node:child_process');
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

async function rest(path, init) {
  const token = await accessToken();
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  if (!res.ok && res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function runQuery(structuredQuery) {
  const out = [];
  let pageToken = '';
  do {
    const body = { structuredQuery, ...(pageToken ? { pageToken } : {}) };
    const page = await rest('/documents:runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const entry of page) {
      if (entry.document) out.push(entry.document);
      if (entry.nextPageToken) pageToken = entry.nextPageToken;
    }
    if (!page.some((entry) => entry.nextPageToken)) break;
  } while (pageToken);
  return out;
}

function decode(value) {
  if (value == null) return null;
  if (value.nullValue !== undefined) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.arrayValue?.values) return value.arrayValue.values.map(decode);
  if (value.mapValue?.fields) return decodeFields(value.mapValue.fields);
  return value;
}

function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = decode(value);
  return out;
}

const pendingDocs = await runQuery({
  from: [{ collectionId: 'pendingFinancialMessages', allDescendants: true }],
  limit: 2000,
});
const receipts = await runQuery({
  from: [{ collectionId: 'messageIngestionReceipts', allDescendants: false }],
  limit: 5000,
});

const stateCounts = {};
for (const doc of receipts) {
  const f = decodeFields(doc.fields);
  stateCounts[f.state ?? '(none)'] = (stateCounts[f.state ?? '(none)'] ?? 0) + 1;
}
console.log('== receipt states ==');
console.log(stateCounts);
console.log('receipts total:', receipts.length);

console.log('\n== pending messages:', pendingDocs.length, '==');
const blockers = {};
for (const doc of pendingDocs) {
  const p = decodeFields(doc.fields);
  let reason;
  if (p.conversionRequired) reason = 'needs_conversion';
  else if (!p.suggestedAccountId) reason = 'needs_account';
  else if (p.kind === 'transfer' && !p.suggestedDestinationAccountId) reason = 'needs_destination';
  else if (p.kind === 'transfer' && p.destinationCurrency && p.destinationCurrency !== p.currency && !p.destinationAmount) reason = 'merged_transfer_missing_destination_amount';
  else reason = 'would_attempt_approve (fails only if account currency/status mismatch etc.)';
  blockers[reason] = (blockers[reason] ?? 0) + 1;
  console.log(
    [
      doc.name.split('/').pop().slice(0, 12),
      p.kind,
      `${p.amount} ${p.currency}`,
      p.date,
      `acct=${p.suggestedAccountId ? p.suggestedAccountId.slice(0, 8) : '—'}`,
      `dest=${p.suggestedDestinationAccountId ? p.suggestedDestinationAccountId.slice(0, 8) : '—'}`,
      `conv=${p.conversionRequired ? 'Y' : 'n'}`,
      `leg=${p.transferLeg ?? '-'}`,
      `batch=${p.importBatchId ?? '-'}`,
      reason,
      `«${String(p.description ?? '').slice(0, 48)}»`,
    ].join(' | '),
  );
}
console.log('\n== blocker counts ==');
console.log(blockers);
