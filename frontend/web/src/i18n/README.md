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
