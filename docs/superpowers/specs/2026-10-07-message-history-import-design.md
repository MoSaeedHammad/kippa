# Message history import — design

Import old phone message history (Android / iPhone), stage every parsed bank
transaction as a pending message, and resolve the whole batch with
approve-all / cancel-all.

## Goal

A full household member can import the SMS history of a phone they already use
(or plan to use) with a bank, without waiting for live forwards:

1. Pick an export file (Android "SMS Backup & Restore" XML) or paste plain
   text messages (iPhone exports / manual paste).
2. See how many messages were found and the duration they cover; optionally
   narrow the range before importing.
3. Every message the existing bank-SMS parser recognizes is staged as a
   `PendingFinancialMessage` tagged with a shared `importBatchId`.
4. On the Approvals page the batch is grouped into one card with
   **Approve all** and **Cancel all**; items that cannot be auto-resolved stay
   pending for the normal per-item review.

## Non-goals

- No MMS parsing, no CSV (plain text paste covers iPhone exports).
- No push notifications for staged imports (a 500-message import must not send
  500 pushes).
- No server-side file parsing — the client extracts raw messages from the
  container format; the server only ever sees individual messages.

## Backend

New pure module `backend/functions/src/domain/message-ingestion/historyImport.ts`:

- `importReceiptKey(householdId, message)` — receipt id for imports:
  `sha256('history-import_' + householdId + '\0' + whitespace-normalized message)`.
  Per-household so different spaces never collide; stable so re-importing the
  same file is idempotent (existing receipts short-circuit, exactly like the
  webhook).
- `sanitizeHistoryMessages(raw)` — validates the callable input: array of
  `{ body, sender?, dateMs? }`, body ≤ 5000 chars, sender ≤ 64 chars, ≥ 0 and
  ≤ 1000 messages per call.
- `stampToDate(dateMs)` — epoch ms → `YYYY-MM-DD`, null when unusable.
- `withinRange(date, from?, to?)` — inclusive `YYYY-MM-DD` range check.
- `buildMergedTransferLeg({ parsed, half, debit, credit, suggestions, destinationAccount })`
  — pure builder for the cross-currency two-leg merge, shared with the webhook
  so imports merge both legs of a phone-banking transfer identically.

New callable feature `backend/functions/src/features/message-ingestion/messageHistoryImport.ts`:

- `importMessageHistory(householdId, messages, batchId?, from?, to?, source?)`
  (`onCall`, `timeoutSeconds: 540`) — `requireFullHouseholdMember`:
  - `batchId` = validated client value or generated `his_<random>`; every
    staged doc carries it plus `importedAt`.
  - Messages with a stamp outside `from`/`to` are skipped before parsing.
  - Matched messages: dedupe by receipt, resolve account/card/category
    suggestions and loan suggestion exactly like the webhook, write pending +
    receipt in chunks of 200 via `getAll` pre-check + `batch.create`.
  - Transfer legs: keep `transferLeg`/`mergeKey`; when the opposite leg is
    already pending (in Firestore or earlier in the same import), merge into a
    single cross-currency transfer using the shared builder.
  - No FCM notifications. Audit log entry per import call (not per message).
  - Returns `{ batchId, staged, duplicates, ignored, unsupported, received }`.
- `decideImportBatch(householdId, batchId, action: 'approve' | 'discard',
  maxItems?)` (`onCall`, `timeoutSeconds: 540`) — `requireFullHouseholdMember`:
  - Loads pendings `where importBatchId == batchId` (no orderBy → no composite
    index needed), processes up to `maxItems` (default 100, cap 300) and
    returns `hasMore` so the client can loop with progress.
  - `discard` reuses `discardPendingFinancialMessage.run(...)` per item.
  - `approve` reuses `approvePendingFinancialMessage.run(...)` per item with
    the stored suggestions: `accountId`/`destinationAccountId` from
    suggestions, category from `suggestedCategoryId` (the approve handler
    itself falls back to pattern rules). Items that cannot be approved safely
    are skipped with a reason and stay pending:
    - no suggested account (`needs_account`), transfer without destination
      (`needs_destination`), no derivable category (`needs_category`),
      foreign-currency charge needing a converted amount (`needs_conversion`),
      or any validation error from the approve handler.
  - Returns `{ approved, discarded, skipped: [{ pendingId, reason }], hasMore }`.

Domain types (`packages/domain/src/index.d.ts`): `PendingFinancialMessage`
gains `importBatchId?: string | null` and `importedAt?: string | null`; add
`ImportMessageHistoryResult` and `DecideImportBatchResult`.

`src/index.ts` exports both callables. Firestore rules need no change (pending
messages are already server-write-only; callables use the Admin SDK).

## Frontend

New pure lib `frontend/web/src/libs/messageHistoryImport.ts` (unit-tested):

- `decodeXmlEntities(text)` — named + numeric entities.
- `parseSmsBackupXml(xml)` — regex-based `<sms …>` attribute extraction
  (`address`, `date`, `readable_date`, `body`); tolerant of huge files and
  escaped entities.
- `parsePlainTextHistory(text)` — line-based blocks with a leading date header
  (`[DD/MM/YY, HH:MM]`, `DD-MM-YYYY HH:MM:SS -`, ISO, …), optional
  `Sender:` prefix, continuation lines until the next header; a text with no
  date headers at all is treated as one message.
- `extractMessages(text, fileName)` — dispatch XML vs text by content.
- `extractDuration(messages)` — earliest/latest `YYYY-MM-DD` from stamps.
- `filterByDuration(messages, from, to)`, `chunkMessages(messages, size)`.

Wiring: `messageIngestionLib.importHistory` / `.decideBatch` call the new
callables; React Query mutations `useImportMessageHistoryMutation` and
`useDecideImportBatchMutation` (invalidating pending/resolved messages,
transactions, ledger lines, loans).

New screen `frontend/web/src/features/message-import/MessageImport.tsx` at
`/import-messages` (SideNav → Transactions group child, `PAGE_TITLES`, i18n
`messageImport` namespace, en + ar):

1. **Choose source** — file picker (`.xml`, `.txt`) or paste area.
2. **Preview** — detected format, message count, extracted duration
   (earliest → latest), editable from/to date narrowing, "Import N messages"
   with chunked-call progress bar.
3. **Result** — staged / duplicate counts and a "Review in Approvals" action.

Approvals page (`PendingTransactions.tsx`): pendings are grouped by
`importBatchId` (pure helper `groupImportedPending`). Live messages keep the
existing card; every import batch gets its own card showing count and date
span with **Approve all** / **Cancel all** (Dialog confirm; per-item rows and
the review dialog unchanged). A small "Import old messages" button joins the
message-connection banner. After a bulk decision the snackbar reports
`Approved X · Y need manual review`.

## Error handling

- Import is idempotent: re-running over the same file re-stages nothing
  (receipts short-circuit duplicates and already-resolved messages).
- Bulk approve never half-fails silently: each item goes through the full
  per-item transaction; failures are per-item skips surfaced in the response
  and the toast.
- Client caps: 1000 messages per callable call, 200-message chunks; the file
  itself is capped by the browser, with a friendly error above 100 MB.

## Testing

- Backend: `historyImport.test.ts` — receipt-key stability across runs and
  households, sanitization caps, stamp/date-range behavior, merged-leg builder
  symmetry.
- Frontend: `messageHistoryImport.test.ts` — Android XML fixture (entities,
  missing dates), text fixtures with/without headers, duration extraction,
  range filter, chunking; `groupImportedPending` test.
- `npm run functions:build` / `functions:test` and `npm test` (web) stay green.
