# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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