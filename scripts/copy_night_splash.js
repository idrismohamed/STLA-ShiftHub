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
    const splashMap = [
        ['splash-port-mdpi.png',    'drawable-night-mdpi'],
        ['splash-port-hdpi.png',    'drawable-night-hdpi'],
        ['splash-port-xhdpi.png',   'drawable-night-xhdpi'],
        ['splash-port-xxhdpi.png',  'drawable-night-xxhdpi'],
        ['splash-port-xxxhdpi.png', 'drawable-night-xxxhdpi'],
        ['splash-land-mdpi.png',    'drawable-night-land-mdpi'],
        ['splash-land-hdpi.png',    'drawable-night-land-hdpi'],
        ['splash-land-xhdpi.png',   'drawable-night-land-xhdpi'],
        ['splash-land-xxhdpi.png',  'drawable-night-land-xxhdpi'],
        ['splash-land-xxxhdpi.png', 'drawable-night-land-xxxhdpi'],
        ['splash-sw600dp.png',      'drawable-night-sw600dp'],
        ['splash-sw720dp.png',      'drawable-night-sw720dp'],
    ];

    splashMap.forEach(([file, folder]) => {
        const src = path.join(nightSrc, file);
        const dst = path.join(resBase, folder, 'splash.png');
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
    });

    // ── Style XMLs (dark background colours) ─────────────────────────────
    const styleMap = [
        ['splash_styles.xml',          'values',          'splash_styles.xml'],
        ['splash_styles_night.xml',    'values-night',    'splash_styles.xml'],
        ['splash_styles_v31.xml',      'values-v31',      'splash_styles.xml'],
        ['splash_styles_night_v31.xml','values-night-v31','splash_styles.xml'],
    ];

    const valSrc = path.join(root, 'res', 'values', 'android');
    styleMap.forEach(([srcFile, dstFolder, dstFile]) => {
        const src = path.join(valSrc, srcFile);
        const dst = path.join(resBase, dstFolder, dstFile);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
    });

    console.log('copy_night_splash: night-mode splash assets copied.');
};
