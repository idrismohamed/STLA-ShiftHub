# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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