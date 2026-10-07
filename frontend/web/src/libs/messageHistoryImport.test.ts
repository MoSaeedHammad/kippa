import { describe, expect, it } from 'vitest';
import {
  chunkMessages,
  extractDuration,
  extractMessages,
  filterByDuration,
  groupImportedPending,
  parsePlainTextHistory,
  parseSmsBackupXml,
} from './messageHistoryImport';
import type { PendingFinancialMessage } from '@kippa/domain';

const XML_FIXTURE = `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>
<smses count="3">
  <sms protocol="0" address="HSBC" date="1767225600000" type="1" body="From HSBC: 01JAN26 Supermarket Purchase from MERCHANT EGP 325.00-" readable_date="1 Jan 2026 12:00:00" />
  <sms protocol="0" address="+201000000000" date="1767312000000" type="1" body="Receipt: total &quot;100&quot; &#10;second line &amp; done <ok>" readable_date="2 Jan 2026 12:00:00" />
  <sms protocol="0" address="BankMisr" date="" type="1" body="تم اضافة مبلغ 5000 الى حساب رقم ****1234" readable_date="Jun 1, 2026 09:30:00" />
  <sms protocol="0" address="+201111111111" date="1767484800000" type="1" body="" />
</smses>`;

describe('parseSmsBackupXml', () => {
  it('extracts epoch-dated messages and skips empty bodies', () => {
    const messages = parseSmsBackupXml(XML_FIXTURE);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({
      body: 'From HSBC: 01JAN26 Supermarket Purchase from MERCHANT EGP 325.00-',
      sender: 'HSBC',
      dateMs: 1_767_225_600_000,
    });
  });

  it('decodes XML entities inside bodies', () => {
    const messages = parseSmsBackupXml(XML_FIXTURE);
    expect(messages[1].body).toBe('Receipt: total "100" \nsecond line & done <ok>');
  });

  it('falls back to readable_date when the epoch stamp is empty', () => {
    const messages = parseSmsBackupXml(XML_FIXTURE);
    expect(messages[2].dateMs).toBeTypeOf('number');
  });

  it('survives a raw > inside an attribute value', () => {
    const messages = parseSmsBackupXml('<smses><sms address="A" date="1000" body="a > b" /><sms address="B" date="2000" body="after" /></smses>');
    expect(messages).toHaveLength(2);
    expect(messages[0].body).toBe('a > b');
    expect(messages[1].body).toBe('after');
  });
});

describe('parsePlainTextHistory', () => {
  it('parses WhatsApp-style bracket headers with sender prefixes', () => {
    const text = [
      '[01/06/26, 14:05:33] HSBC: From HSBC: 01JUN26 Purchase EGP 50.00-',
      'second line of the same message',
      '[02/06/26, 09:00:00] +2010: Transfer from EXAMPLE EGP 200.00+',
    ].join('\n');
    const messages = parsePlainTextHistory(text);
    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe('HSBC');
    expect(messages[0].body).toBe('From HSBC: 01JUN26 Purchase EGP 50.00-\nsecond line of the same message');
    expect(messages[0].dateMs).toBe(Date.UTC(2026, 5, 1, 14, 5, 33));
    expect(messages[1].dateMs).toBe(Date.UTC(2026, 5, 2, 9, 0, 0));
  });

  it('parses dash-style date headers without brackets', () => {
    const messages = parsePlainTextHistory('01-06-2026 14:05 - From HSBC: Purchase EGP 50.00-');
    expect(messages).toHaveLength(1);
    expect(messages[0].dateMs).toBe(Date.UTC(2026, 5, 1, 14, 5, 0));
    expect(messages[0].body).toBe('From HSBC: Purchase EGP 50.00-');
  });

  it('parses ISO headers and keeps MM/DD out of the way of DD/MM', () => {
    const messages = parsePlainTextHistory('2026-06-01 14:05 - Body ISO');
    expect(messages[0].dateMs).toBe(Date.UTC(2026, 5, 1, 14, 5, 0));
  });

  it('treats header-less text as a single message', () => {
    const messages = parsePlainTextHistory('From HSBC:\njust one message');
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('From HSBC:\njust one message');
    expect(messages[0].dateMs).toBeUndefined();
  });
});

describe('extractMessages', () => {
  it('dispatches XML by content', () => {
    const result = extractMessages(XML_FIXTURE);
    expect(result.format).toBe('android-xml');
    expect(result.messages).toHaveLength(3);
  });

  it('dispatches plain text and strips the BOM', () => {
    const result = extractMessages('\uFEFF[01/06/26, 10:00] A: hello', 'notes.txt');
    expect(result.format).toBe('text');
    expect(result.messages[0].body).toBe('hello');
  });
});

describe('extractDuration', () => {
  it('returns the earliest and latest stamped dates', () => {
    const { from, to } = extractDuration([
      { body: 'a', dateMs: Date.UTC(2024, 0, 15) },
      { body: 'b', dateMs: Date.UTC(2026, 5, 1) },
      { body: 'undated' },
    ]);
    expect(from).toBe('2024-01-15');
    expect(to).toBe('2026-06-01');
  });

  it('returns nulls when nothing is dated', () => {
    expect(extractDuration([{ body: 'a' }])).toEqual({ from: null, to: null });
  });
});

describe('filterByDuration', () => {
  const messages = [
    { body: 'early', dateMs: Date.UTC(2024, 0, 15) },
    { body: 'inside', dateMs: Date.UTC(2025, 2, 10) },
    { body: 'late', dateMs: Date.UTC(2026, 2, 10) },
    { body: 'undated' },
  ];

  it('keeps everything when no range is set', () => {
    expect(filterByDuration(messages)).toHaveLength(4);
  });

  it('narrows to the inclusive range and drops undated messages', () => {
    const filtered = filterByDuration(messages, '2025-01-01', '2025-12-31');
    expect(filtered.map((message) => message.body)).toEqual(['inside']);
  });
});

describe('chunkMessages', () => {
  it('chunks with the default import call size', () => {
    const messages = Array.from({ length: 450 }, (_, index) => ({ body: `m${index}` }));
    const chunks = chunkMessages(messages);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(200);
    expect(chunks[2]).toHaveLength(50);
  });
});

describe('groupImportedPending', () => {
  const pendingFactory = (overrides: Partial<PendingFinancialMessage>): PendingFinancialMessage => ({
    id: 'id', householdId: 'hh', receivedBy: 'u', kind: 'expense', source: 'import',
    provider: 'hsbc', amount: 10, currency: 'EGP', date: '2025-01-01', description: 'd',
    messagePreview: 'p', createdAt: '2026-10-01T00:00:00.000Z', status: 'pending', ...overrides,
  });

  it('groups by batch and sorts batches newest first', () => {
    const pending = [
      pendingFactory({ id: 'live-1' }),
      pendingFactory({ id: 'old-1', importBatchId: 'his_aaa', importedAt: '2026-09-01T00:00:00.000Z' }),
      pendingFactory({ id: 'new-1', importBatchId: 'his_bbb', importedAt: '2026-10-01T00:00:00.000Z' }),
      pendingFactory({ id: 'new-2', importBatchId: 'his_bbb', importedAt: '2026-10-01T00:00:00.000Z' }),
    ];
    const batches = groupImportedPending(pending);
    expect(batches.map((batch) => batch.batchId)).toEqual(['his_bbb', 'his_aaa']);
    expect(batches[0].items.map((item) => item.id)).toEqual(['new-1', 'new-2']);
  });

  it('ignores live messages without a batch id', () => {
    expect(groupImportedPending([pendingFactory({ id: 'live' })])).toEqual([]);
  });
});
