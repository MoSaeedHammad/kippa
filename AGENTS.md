# Kippa UI Rules

- The shared package at `packages/design-system` is the single source of truth for component appearance.
- Reuse an existing MUI/design-system variant whenever it fits. If a reusable visual treatment is missing, define a named variant in the design system and add its TypeScript augmentation before using it.
- Feature components must not recreate visual appearance through `sx`. Use `sx` only for layout and positioning concerns such as grid placement, flex alignment, sizing constraints, spacing between regions, responsive placement, and sticky/fixed coordinates.
- Typography appearance must use named theme variants. Do not set font size, weight, line height, letter spacing, or text transformation ad hoc in feature components.
- Icons must use the shared `AppIcon` Iconsax adapters; do not import icon libraries directly into features.

# Change Lifecycle

- Commit and push automatically after every completed change — never leave finished work uncommitted waiting for an explicit request. Push to the current branch's upstream (the `fork` remote).
- Deploy after every pushed change with `npm run deploy` (builds functions + web, then `firebase deploy`: hosting, Firestore rules, functions). When only one target changed, the narrower script (`npm run deploy:web` or `npm run deploy:functions`) is enough.
- Verify before shipping: tests and the build must pass (`npm test`, `npm run build`) before committing. If a commit, push, or deploy fails, report the failure — do not retry it silently.
