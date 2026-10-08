/* Replicates decideImportBatch's selection: sort pending docs of a batch by
 * createdAt, take the first 100, classify each with the same pre-checks the
 * backend uses before calling the approve handler. Read-only.
 * Usage: node scripts/analyze-batch-window.mjs
 */
const PROJECT = 'kippa-1787921674';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;
const BATCH = process.argv[2] ?? 'his_f9f829c5ad1ad97f';

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

async function runQuery(structuredQuery, parent = '/documents') {
  const out = [];
  let pageToken = '';
  for (;;) {
    const body = { structuredQuery, ...(pageToken ? { pageToken } : {}) };
    const page = await rest(`${parent}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const entry of page) {
      if (entry.document) out.push(entry.document);
    }
    pageToken = page.find((entry) => entry.nextPageToken)?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

function decode(value) {
  if (value == null) return null;
  if (value.nullValue !== undefined) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.mapValue?.fields) return Object.fromEntries(Object.entries(value.mapValue.fields).map(([k, v]) => [k, decode(v)]));
  return value;
}
const fields = (doc) => Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)]));

const HOUSEHOLD = process.argv[3] ?? '4830ed6f-d2b7-4199-8150-379728fbf838';
const docs = await runQuery({
  from: [{ collectionId: 'pendingFinancialMessages' }],
  where: { fieldFilter: { field: { fieldPath: 'importBatchId' }, op: 'EQUAL', value: { stringValue: BATCH } } },
  limit: 5000,
}, `/documents/households/${HOUSEHOLD}`);
console.log('pending docs in batch:', docs.length);

const sorted = docs.map((doc) => ({ id: doc.name.split('/').pop(), f: fields(doc) }))
  .sort((a, b) => String(a.f.createdAt ?? '').localeCompare(String(b.f.createdAt ?? '')));

const counts = { needs_conversion: 0, needs_account: 0, needs_destination: 0, would_attempt: 0 };
const createdAtClusters = new Map();
const sample = { needs_conversion: [], needs_account: [], needs_destination: [], would_attempt: [] };
for (const { id, f } of sorted) {
  let reason;
  if (f.conversionRequired) reason = 'needs_conversion';
  else if (!f.suggestedAccountId) reason = 'needs_account';
  else if (f.kind === 'transfer' && !f.suggestedDestinationAccountId) reason = 'needs_destination';
  else reason = 'would_attempt';
  counts[reason]++;
  createdAtClusters.set(f.createdAt, (createdAtClusters.get(f.createdAt) ?? 0) + 1);
  if (sample[reason].length < 5) sample[reason].push(`${id.slice(0, 10)} ${f.kind} ${f.amount} ${f.currency} ${f.date} «${String(f.description ?? '').slice(0, 40)}»`);
}
console.log('first-100 classification of ENTIRE batch (order = backend slice order):');
console.log(counts);
console.log('createdAt clusters (import call timestamps):');
for (const [ts, n] of [...createdAtClusters.entries()].sort()) console.log(' ', ts, '→', n);

console.log('\nFIRST 100 docs the backend would process per call:');
const window100 = sorted.slice(0, 100);
const winCounts = { needs_conversion: 0, needs_account: 0, needs_destination: 0, would_attempt: 0 };
for (const { f } of window100) {
  const reason = f.conversionRequired ? 'needs_conversion'
    : !f.suggestedAccountId ? 'needs_account'
    : (f.kind === 'transfer' && !f.suggestedDestinationAccountId) ? 'needs_destination'
    : 'would_attempt';
  winCounts[reason]++;
}
console.log(winCounts);
console.log('\nsamples:');
for (const [reason, items] of Object.entries(sample)) {
  console.log(`\n[${reason}]`);
  for (const line of items) console.log('  ', line);
}
