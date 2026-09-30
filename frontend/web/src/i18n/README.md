# kippa web i18n

- Namespaces: `src/i18n/locales/{en,ar}/<ns>.json` — one per feature area.
- Keys are typed: adding a key to `en` requires the same key in `ar` (parity test) and vice versa.
- To add a new namespace: create both JSONs, register in `resources.ts` and `i18next.d.ts`, add to the parity test's namespace list (it derives from `resources`).

## Arabic glossary

| English | Arabic | Notes |
| --- | --- | --- |
| Save | حفظ | |
| Cancel | إلغاء | |
| Delete | حذف | |
| Edit | تعديل | |
| Add | إضافة | |
| Loading… | جارٍ التحميل… | |
| Household | البيت المالي | check UBIQUITOUS_LANGUAGE.md per term; update this table as terms are decided |
| Shared balance | الرصيد المشترك | |
| Space | الفضاء | current term per UBIQUITOUS_LANGUAGE.md (plural: الفضاءات); "My space" = فضائي |
| Approvals | الموافقات | |
| Transactions | المعاملات | |
| Reconciliation | المطابقة | |
| Statement | كشف حساب | plural "Statements" = الكشوفات |
| Category | فئة | plural "Categories" = الفئات |
| Invite ID | معرف الدعوة | matches appShell profileMenu |
| Shared account | الحساب المشترك | |
| Join | الانضمام | "Join space" = الانضمام إلى الفضاء |
| Sign in | تسجيل الدخول | |
| Sign out | تسجيل الخروج | matches appShell profileMenu |
| Expense | مصروف | plural "Expenses" = المصروفات |
| Space name | اسم الفضاء | |
| Balance | الرصيد | "My balance" = رصيدي; "Total balance" = الرصيد الإجمالي |
| Budget | الميزانية | "Budget Breakdown" = تفصيل الميزانية |
| Loan | القرض | plural "Loans" = القروض; installment/payment = قسط (plural أقساط) |
| Cycle | الدورة | budget cycle; NOTE: UBIQUITOUS_LANGUAGE.md prescribes "Statement" (كشف حساب) for user-facing copy — dashboard source still says "cycle"; renaming is a product decision |
| Remaining | المتبقي | |
| Spent | المصروف | |
| Account | الحساب | plural "Accounts" = الحسابات; "My Accounts" = حساباتي |
| Income | الإيرادات | income entry = إدخال إيرادات |
| Transfer | التحويل | |
| Paid | مدفوع / تم دفع | Due = مستحق |
| Approve | موافقة | "Request to join" = طلب الانضمام |
| Decline / Reject | رفض | |
| Discard | إهمال | pending-message triage |
| Void | إبطال | transaction voiding |
| Frozen | مجمّدة | card state |
| Pending | معلق | entries, requests, messages |
| Installment | قسط | plural أقساط; see Loan |
| Wallet | محفظة | account type; Cash = نقد |
