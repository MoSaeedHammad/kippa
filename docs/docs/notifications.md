# Notifications

## Goals

Notifications should support the habit and prevent drift.

They should not shame the user or spam the household.

## Notification Types

### Daily Missing Expense Reminder

Trigger:

```text
No expense transaction created today by configured reminder time.
```

Message idea:

```text
No expenses recorded today. Add anything you spent before the day slips.
```

### Category Warning

Trigger:

```text
Category spent ratio crosses configured threshold.
```

Suggested thresholds:

- 80 percent of category budget
- over pace compared to cycle progress

### Saving Target Warning

Trigger:

```text
Projected saving falls below target.
```

### Reconciliation Reminder

Trigger:

```text
No balance check for important accounts in N days.
```

Suggested default:

- every 3 days

### Cycle Close Reminder

Trigger:

```text
Cycle expected end date passed and cycle is still open.
```

## User Settings

Per user:

- enable daily reminder
- reminder time
- quiet hours
- enable category warnings
- enable saving warnings
- enable reconciliation reminders

## Implementation Notes

Use Firebase Cloud Messaging where appropriate.

For PWA push support, implementation must account for browser/platform restrictions, especially iOS Home Screen web apps.

## Bank SMS ingestion

`ingestFinancialMessage` accepts forwarded SMS from any device:

- `POST https://<region>-<project>.cloudfunctions.net/ingestFinancialMessage`
- Header: `Authorization: Bearer <credentialId>.<secret>` (create in *Pending → Connect*)
- Body: JSON `{"text": "<sms>", "sender": "BankMisr"}` — also accepts `message`/`body`/`sms`/`content` field names, form-encoded, or a raw text body. Optional: `source`, `idempotencyKey`, `receivedAt`.

Supported message matrix: HSBC (purchases, ATM, phone-banking transfers, IPN, card payments, statements-ignored) and Bank Misr (instant transfers in/out, credit-card charges EGP+USD, ATM withdrawals, cash deposits, card payments, login alerts-ignored). USD card charges require the EGP amount at approval; the original and rate are stored on the transaction.

Android setup: use any SMS-forwarder app (e.g. Transponder, SMS Forwarder, MacroDroid). Create a rule for senders `BankMisr` and `HSBC` that POSTs `{"text": "%text%", "sender": "%sender%"}` with the Bearer header to the endpoint above.

