# Interface simplification and localization implementation plan

**Goal:** Apply the eleven requested interface changes and publish to main and GitHub Pages.

**Architecture:** Keep React/Vite, the current design and all stored data formats. Use a React localization provider with Spanish source keys and complete English, French, Portuguese and Italian catalogs. Resolve the system language until the person explicitly chooses a language in Settings. Preserve integer-cent financial calculations.

## Tasks

- [x] Unify expense entry into one form with the amount, description, payer, optional details and “¿Para quién?” with equal/exact shares. Preserve validation, drafts and saving guards.
- [x] Remove the requested identity explanations, group fallback slogan, Summary tab and empty-state slogan; keep equal bottom navigation styling with the expense action emphasized.
- [x] Add language detection, a persisted system/manual preference, localized copy, dates and currency formatting, and language controls in Settings.
- [x] Remove the amount input focus box, retain its focused baseline and add short feedback for optional details, exact shares and participant selection. Respect reduced motion.
- [x] Disable contact autofill hints on name entry. Safari controls its native keyboard accessory toolbar; a web app cannot remove it completely.
- [x] Run behavioral tests, production build, browser checks at mobile and desktop sizes, and code review; prepare the verified release for main and GitHub Pages.

## Validation and release

Use unit tests for locale resolution/persistence/interpolation and financial formatting, existing ledger/sync/navigation regression tests, and browser checks for equal/exact expense entry, validation, language switching and persistence. Preserve stored keys and all group/member content. A failed build, broken entry flow or data regression blocks deployment. GitHub Pages publishes on a main push; revert the release commit and republish if a release regression is confirmed.

## Verification evidence

- 313 automated tests pass, including localization, financial parsing, single-submit expense entry, blank previews and Google SDK locale loading.
- Production build and whitespace checks pass.
- Browser checks cover exact-split validation, successful saving, language changes and persistence, Google button localization, and 320px/430px phone and 1440px desktop layouts in dark and light themes.
- Automated production inspection at 390px, 768px and 1440px reports no failures; its desktop empty-space warning belongs to the genuine first-use empty state.
- Physical iOS keyboard rendering remains unverified. The web app opts out of contact autocomplete, while Safari owns the native keyboard accessory toolbar.
