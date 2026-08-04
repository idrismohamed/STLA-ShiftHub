# STLA Shift Hub

A mobile application for managing shift schedules, payroll calculations, and work tracking for STLA (presumably a union or organization).

## Features

- **Shift Management**: Enter and track work shifts with different types (Day/Night, Overtime, etc.)
- **Payroll Calculator**: Calculate wages, taxes, and generate paystubs
- **Calendar View**: Visual calendar showing shifts and rotations
- **Data Export/Import**: Backup and restore your data
- **Biometric Authentication**: Secure access to financial data
- **Notifications**: Reminders for shift changes and important dates
- **Theme Support**: Light/Dark/System themes

## Project Structure

```
www/
├── app.js              # Main application orchestrator
├── calendar.js         # Calendar rendering and navigation
├── constants.js        # Application constants and configuration
├── dataExport.js       # Data backup and import functionality
├── index.html          # Main HTML file
├── notifications.js    # Notification management
├── payroll.js          # Payroll calculations and rendering
├── rotation.js         # Shift rotation logic
├── settings.js         # Settings management
├── shiftForm.js        # Shift entry form handling
├── state.js            # Application state management
├── theme.js            # Theme management
├── ui.js               # UI utilities and helpers
├── utils.js            # General utility functions
├── yearSelector.js     # Year navigation controls
└── styles.css          # Application styles
```

## Development Setup

### Prerequisites
- Node.js and npm
- Cordova CLI: `npm install -g cordova`
- Android Studio (for Android builds)
- Xcode (for iOS builds, macOS only)

### Installation
1. Clone the repository
2. Navigate to the project directory
3. Add platforms: `cordova platform add android` and/or `cordova platform add ios`
4. Install plugins: `cordova plugin add cordova-plugin-device cordova-plugin-statusbar cordova-plugin-fingerprint-aio cordova-plugin-x-socialsharing cordova-plugin-local-notification`
5. Build: `cordova build`

### Running
- `cordova run android` - Run on Android device/emulator
- `cordova run ios` - Run on iOS device/simulator
- `cordova run browser` - Run in browser (limited functionality)

### Building for a device (VoltBuilder)

Cloud builds go through [VoltBuilder](https://volt.build), which takes a zip of
the project and returns a signed APK.

```bash
./scripts/package-voltbuilder.sh      # → build/ShiftHub-voltbuilder.zip
```

Upload that zip at volt.build.

**Signing credentials are never committed.** `voltbuilder.json` holds build
settings only; the keystore and its passwords live in `voltbuilder.local.json`,
which is git-ignored and merged into the zip by the packaging script:

```bash
cp voltbuilder.local.json.sample voltbuilder.local.json
# fill in: base64 -w0 my-release.p12   → release_body
```

Without that file the script still produces a zip, but the build won't be
signed. Keep a backup of the keystore somewhere safe (a password manager) —
losing it means you can no longer ship updates to an app already signed with it.

## Architecture

The application follows a modular architecture with separate JavaScript files for different concerns:

- **Constants & Utils**: Core constants and utility functions
- **State Management**: Application state and localStorage handling
- **Business Logic**: Rotation, payroll, calendar calculations
- **UI Components**: Form handling, settings, UI utilities
- **Services**: Notifications, data export, theming

## Dependencies

- **Chart.js**: For payroll visualization charts
- **jsPDF**: For generating PDF paystubs
- **Cordova Plugins**:
  - Device information
  - Status bar styling
  - Biometric authentication
  - Social sharing
  - Local notifications

## Contributing

1. Follow the existing modular structure
2. Test on multiple platforms
3. Ensure Cordova plugins work correctly
4. Update documentation as needed

## License

[Add license information here]