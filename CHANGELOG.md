# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-08-04

### Fixed
- Time-off detail sheet (Vacation / Lieu / Drop) printed its title's icon as
  raw `<svg …>` text — the title was assigned with `textContent` instead of
  `innerHTML`
- Signing keystore and passwords no longer live in `voltbuilder.json`; they
  move to a git-ignored `voltbuilder.local.json` merged in at packaging time
  by `scripts/package-voltbuilder.sh`. **The old key is still in git history
  and must be rotated.**
- App version in `config.xml` bumped 1.0.0 → 1.2.1 (it had drifted behind the
  changelog, so builds shared a versionCode)
- **On-shift notification crashed the app on Android 12+.** The "Add note"
  action used an inline text input (RemoteInput); the notification plugin
  builds every action's PendingIntent with FLAG_IMMUTABLE on Android 12+, and
  Android refuses to attach a RemoteInput to an immutable PendingIntent, so
  posting the card threw. The action now launches the app straight to that
  day's Notes field instead — same one-tap flow, no RemoteInput
- On-shift cards are only scheduled 48h ahead (was 30 days), keeping the
  sticky-notification batch small, and are refreshed on app resume
- Notification scheduling and the action-handler registration are wrapped so a
  plugin failure degrades gracefully instead of breaking the render

## [1.2.0] - 2026-08-04

### Changed — Material 3 Expressive redesign
- Rebuilt both theme palettes as an M3 tonal token system (surfaces,
  primary/tertiary/error roles, shift-semantic container pairs) with legacy
  aliases so no selector broke; "today" moved from orange to tertiary violet
- Replaced UI emoji with a bundled SVG icon sprite (www/icons.js) —
  consistent glyphs that tint with their surroundings in both themes
- Header became an M3 large app bar with a day/night monogram badge
  (replacing the raster logo that clashed in light theme)
- Bottom pill bar restyled as an M3E floating toolbar; Month/Week/Year is a
  connected button group with a shape-morphing sliding indicator
- Calendar cells and week cards use tonal container washes with token
  accents; pills/chips/badges use container-bg + on-container text
  (previously white-on-tint, unreadable in light mode); cells shape-morph
  on press
- Pay-period progress is an M3E wavy progress bar (reduced-motion safe)
- Bottom sheets: tonal cards, expressive grouped settings lists, filter-chip
  toggles with a morphing check, and a full-width sticky action footer that
  no longer overlaps sheet content
- Analytics: tonal stat tiles with clamped display numerals (fixes the
  clipped Gross/Net/Hours row), softened light-theme chart palette,
  staggered card entrances
- Week-view header no longer wraps: date pill shrinks/ellipsizes so the view
  tabs and Today button always share its line

### Fixed
- chartPaired zero-value rows render as empty tracks instead of stray "0"s
- One remaining `transition: all`; QR image outline; several sub-40px hit
  areas (nav chevrons, delete buttons)

## [1.1.0] - 2026-08-04

### Added
- Auto-backup safety net: debounced compressed snapshots to IndexedDB and the
  app-private Cordova data directory after every data change, persistent-storage
  protection request, and a one-tap restore offer when a launch finds no data
- Live marginal-pay preview in the booking form ("+$X gross · ≈ +$Y net this
  pay period"), computed with the real payroll engine, cap-aware
- ICS calendar export (Settings → Export Calendar): next 12 months of shifts as
  a standard .ics file shareable to any calendar app
- Estimated 2027 tax tables (indexed ~2% from 2026, replaced automatically by
  the tax-table auto-fetch once CRA publishes real figures)
- New analytics cards: this year vs last year, OT by month, rest & recovery
  (average turnaround + short-rest count over the last 8 weeks)
- On-shift status notification (opt-in): pinned only while a shift runs, with a
  quick "Add note" input action; notes also editable from the booking sheet
- Fatigue-engine smoke tests (120h cap, 16h/24h window, rest rule, overrides)
  plus new suites for auto-backup, pay preview, ICS, analytics and notes

### Changed
- calculateTaxes() now reads federal/Ontario brackets, BPA phase-out and
  surtax thresholds from per-year tax tables (2024–2026 outputs unchanged,
  pinned by golden regression tests)
- Analytics dashboard extracted from calendar.js into analytics.js
- Day-schedule resolution unified into resolveDaySchedule(), shared by calendar
  sync, notifications and the ICS export

### Fixed
- saveSettings() no longer drops settings without a form field
  (hasSeenOnboarding, lastBackupAt, backupReminderDays, ...)
- 'Off Day' override no longer syncs to the phone calendar as a bogus
  midnight "DAY SHIFT" event

## [1.0.0] - 2026-05-03

### Added
- Complete modular refactoring of application code
- Separate modules for shiftForm, settings, payroll, theme, yearSelector, dataExport
- README.md with project documentation
- package.json with build scripts
- .gitignore for Cordova projects
- ESLint configuration for code quality

### Changed
- app.js reduced from ~1200 lines to 44 lines
- Improved code organization and maintainability
- Better separation of concerns

### Technical Details
- Modular architecture with dependency-ordered script loading
- Maintained all existing functionality
- Improved debugging and development experience