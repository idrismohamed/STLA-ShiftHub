#!/usr/bin/env node
// after_prepare hook — copies night-mode splash screens and style XMLs
// into the Android platform resource folders so Android picks them
// automatically when the device is in dark mode.

const fs   = require('fs');
const path = require('path');

module.exports = function (context) {
    const root   = context.opts.projectRoot;
    const resBase = path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'res');

    if (!fs.existsSync(resBase)) {
        console.log('copy_night_splash: Android platform not found, skipping.');
        return;
    }

    // ── Night splash PNGs ─────────────────────────────────────────────────
    const nightSrc = path.join(root, 'res', 'screen', 'android-night');
    // Android qualifier order: orientation(land) < ui-mode(night) < density
    // smallestWidth(sw*dp) must come BEFORE ui-mode(night)
    const splashMap = [
        ['splash-port-mdpi.png',    'drawable-night-mdpi'],
        ['splash-port-hdpi.png',    'drawable-night-hdpi'],
        ['splash-port-xhdpi.png',   'drawable-night-xhdpi'],
        ['splash-port-xxhdpi.png',  'drawable-night-xxhdpi'],
        ['splash-port-xxxhdpi.png', 'drawable-night-xxxhdpi'],
        ['splash-land-mdpi.png',    'drawable-land-night-mdpi'],
        ['splash-land-hdpi.png',    'drawable-land-night-hdpi'],
        ['splash-land-xhdpi.png',   'drawable-land-night-xhdpi'],
        ['splash-land-xxhdpi.png',  'drawable-land-night-xxhdpi'],
        ['splash-land-xxxhdpi.png', 'drawable-land-night-xxxhdpi'],
        ['splash-sw600dp.png',      'drawable-sw600dp-night'],
        ['splash-sw720dp.png',      'drawable-sw720dp-night'],
    ];

    splashMap.forEach(([file, folder]) => {
        const src = path.join(nightSrc, file);
        const dst = path.join(resBase, folder, 'splash.png');
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
    });

    // Style XMLs skipped — they reference @style/AppTheme which cordova-android 15
    // does not expose at resource-link time, causing a build failure. The night-mode
    // PNG drawables alone are sufficient to show the correct dark splash screen.

    console.log('copy_night_splash: night-mode splash assets copied.');
};
