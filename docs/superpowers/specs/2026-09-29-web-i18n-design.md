# Web App Localization (i18n) — Design

Date: 2026-09-29
Scope: `frontend/web` only. The landing site (`frontend/landing`) and backend Cloud Functions strings (push notifications, cron messages) are explicitly out of scope for this effort.

## Goals

- Every user-facing string in the web app is translatable.
- English (`en`) and Arabic (`ar`) ship together; Arabic always renders with full RTL layout.
- Missing translations degrade gracefully to English, never to raw keys.

## Decisions (agreed with user)

| Question | Decision |
| --- | --- |
| Scope | Web app only |
| Languages | English + Arabic (includes RTL support) |
| Library | `react-i18next` + `i18next` |

## Architecture

### Initialization

- Dependencies added to `frontend/web`: `i18next`, `react-i18next`, `stylis-plugin-rtl` (dev-time RTL mirroring via Emotion), plus `stylis` if version pinning requires it.
- `src/i18n/index.ts` creates and exports the configured `i18next` instance; `main.tsx` imports it once before `App` renders.
- Translation resources are **statically imported** JSON (no http-backend/lazy loading) — bundle-size cost of two languages is acceptable for this SPA and avoids async first-paint complexity.

### Translation files

- Location: `src/i18n/locales/{en,ar}/<namespace>.json`.
- One namespace per feature area, mirroring `src/features`:
  `common`, `auth`, `appShell`, `dashboard`, `accounts`, `transactions`, `household`, `sharedBalance`, `sharedAccounts`, `ai`, `budgetCycles`, `categories`, `cards`, `loans`, `fastEntry`, `pendingTransactions`, `reconciliation`, `activity`, `notifications`.
- `common` holds shared UI strings (OK/Cancel/Save/Delete, retry, loading, generic confirmations).
- Keys are structured `section.context` (e.g. `household.membersCard.addMember`), not sentence-hash keys, so the English copy stays reviewable in context.

### Type safety & parity

- `src/i18n/i18next.d.ts` augments `CustomTypeOptions` with the flattened key union derived from the `en` JSONs, so `t('bogus.key')` is a TypeScript error.
- A vitest test (`src/i18n/locales.test.ts`) deep-compares the key sets of `en` and `ar` namespaces and fails on any drift.
- `fallbackLng: 'en'`: missing Arabic strings render English at runtime while the type/parity checks catch them in CI.

### Language selection

- Resolution order: stored choice (`localStorage["kippa.lang"]`) → browser language (`navigator.language`, accepting `ar*` and `en*` prefixes) → `en`.
- Changing language calls `i18n.changeLanguage`, writes localStorage, and updates direction (below).
- The switcher lives in `ProfileMenu`, using existing design-system menu variants; icons via `AppIcon`; `sx` restricted to layout/positioning per AGENTS.md.

### RTL

- On language change and at boot, set `document.documentElement.dir` to `rtl` (ar) or `ltr` (en) and set `theme.direction` accordingly.
- Mirroring uses the standard MUI approach: two Emotion caches (`stylis` plain, `stylis-plugin-rtl` for RTL) selected by a `CacheProvider` keyed off the active direction.
- MUI logical properties handle most mirroring automatically once `theme.direction` flips. Any hard-coded `left`/`right` in `sx` encountered during extraction is converted to logical properties (`insetInlineStart`, `marginInlineStart`, …) in the same change.

### Dates & numbers

- A small helper (`useLocaleInfo` in `src/i18n`) exposes the active language's date-fns locale. Arabic uses `ar-EG` so numerals render as Arabic-Indic digits consistent with the locale; English uses `en-US`.
- The helper feeds `adapterLocale` into the existing MUI X `LocalizationProvider` and is used by any `format`/`formatDistance` calls.
- Currency and number rendering uses `Intl.NumberFormat` with the active locale, keeping the app's existing currency code behavior unchanged.

### String extraction rules

- All user-facing literals in `frontend/web/src` become `t('ns.key')`:
  - JSX labels, headings, empty states, tooltips, aria-labels.
  - notistack snackbar messages.
  - Validation/error messages in `src/libs` — these become stable message keys resolved to text at the display site (throw/callers pass keys, not English prose).
  - AI assistant UI strings and user-visible tool-result strings in `src/features/ai` (including `readTools.ts`).
- Interpolation: `t('key', { name })`; counts use i18next plural keys (`key_one` / `key_other`).
- Not translated (backend-owned content, per scope): Firestore-stored notification titles/bodies, AI prompt internals, raw user-entered data.

## Testing & verification

1. `npm run typecheck` in `frontend/web` — key typing catches invalid `t()` calls.
2. `locales.test.ts` — en/ar key parity.
3. Existing vitest suite passes.
4. Manual smoke check: switch to Arabic, verify RTL layout of app shell + one dense feature (dashboard, transactions), verify dates/numbers render with `ar-EG` conventions.

## Rollout

Implementation is staged feature-area by feature-area (infrastructure → app shell/auth → dense features → AI), tracked in the implementation plan. Each stage keeps the app fully working in English; Arabic coverage grows with each stage.
