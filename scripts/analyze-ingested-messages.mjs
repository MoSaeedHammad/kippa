/* One-off analysis of ingested bank messages in Firestore (read-only).
 * Usage: node scripts/analyze-ingested-messages.mjs
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

async function listAll(path) {
  const docs = [];
  let pageToken = '';
  do {
    const page = await rest(`${path}?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`);
    docs.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

function decodeFields(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    out[key] = value.stringValue ?? value.integerValue ?? value.doubleValue ?? value.nullValue ?? value.booleanValue ?? value;
  }
  return out;
}

function shape(preview) {
  return preview
    .replace(/\d+[A-Z]{3}\d{2,4}/g, '#DATE')
    .replace(/\d{2}[-/][A-Z]{3}[-/]\d{4}/g, '#DATE')
    .replace(/\d{2}\/\d{2}(\/\d{4})?/g, '#DATE')
    .replace(/\d{2}-\d{2}-\d{4}/g, '#DATE')
    .replace(/\d{2}:\d{2}(:\d{2})?/g, '#TIME')
    .replace(/[A-Z]{3}/g, '#CUR')
    .replace(/[\d.,]+/g, '#AMT')
    .replace(/\*+|\bx+\d*\b/g, '*ACCT')
    .replace(/\s+/g, ' ')
    .slice(0, 90);
}


// collectionGroup style needs runQuery; do per-household via known households from pendings instead:
const first = await rest('/documents/households?pageSize=50');
console.log('top-level households:', (first.documents ?? []).length, '— using collectionGroup runQuery instead');

const q = await rest('/documents:runQuery', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'pendingFinancialMessages', allDescendants: true }], limit: 1000 } }),
});
const pendingDocs = q.filter((entry) => entry.document).map((entry) => decodeFields(entry.document));

const receiptDocs = (await listAll('/documents/messageIngestionReceipts')).map(decodeFields);

console.log(`\npendingFinancialMessages: ${pendingDocs.length}`);
console.log(`messageIngestionReceipts: ${receiptDocs.length}`);
console.log('receipt states:', JSON.stringify(receiptDocs.reduce((acc, r) => { acc[r.state] = (acc[r.state] ?? 0) + 1; return acc; }, {})));

const by = (key) => pendingDocs.reduce((acc, doc) => { const k = String(doc[key] ?? 'null'); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
console.log('\nby provider:', JSON.stringify(by('provider')));
console.log('by kind:', JSON.stringify(by('kind')));
console.log('by source:', JSON.stringify(by('source')));
console.log('counterparty set:', pendingDocs.filter((d) => d.counterparty && d.counterparty !== 'null').length, '/', pendingDocs.length);
console.log('accountHintLast4 set:', pendingDocs.filter((d) => d.accountHintLast4 && d.accountHintLast4 !== 'null').length);
console.log('suggestedAccountId set:', pendingDocs.filter((d) => d.suggestedAccountId && d.suggestedAccountId !== 'null').length);
console.log('importBatchId set:', pendingDocs.filter((d) => d.importBatchId && d.importBatchId !== 'null').length);

console.log('\nmessage template shapes:');
const shapes = new Map();
for (const doc of pendingDocs) {
  const key = shape(String(doc.messagePreview ?? ''));
  if (!shapes.has(key)) shapes.set(key, { count: 0, sample: doc.messagePreview, provider: doc.provider, kind: doc.kind, counterparty: doc.counterparty ?? null });
  shapes.get(key).count++;
}
const sorted = [...shapes.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [key, info] of sorted.slice(0, 25)) {
  console.log(`\n[${info.count}x] ${info.provider} / ${info.kind} / counterparty=${info.counterparty}`);
  console.log('  shape :', key);
  console.log('  sample:', String(info.sample).slice(0, 160));
}

// Receipts resolved but never matched — ignored snapshots have no message; check providers of approved/discarded
const resolvedProviders = receiptDocs.filter((r) => r.state === 'approved' || r.state === 'discarded')
  .reduce((acc, r) => { const p = r.snapshot?.stringValue ? null : r.provider; acc[p ?? (r.snapshot ? 'with-snapshot' : 'no-snapshot')] = (acc[p ?? 'x'] ?? 0) + 1; return acc; }, {});
console.log('\nresolved receipts:', JSON.stringify(resolvedProviders));
