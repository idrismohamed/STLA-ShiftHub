// ─── Theme ────────────────────────────────────────────────────────────────────

applyTheme(sysSettings.theme);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (sysSettings.theme === 'system') applyTheme('system');
});

// ─── Cordova / browser event wiring ──────────────────────────────────────────

document.addEventListener('deviceready', function() {
    document.addEventListener('backbutton', function(e) {
        const activeEl       = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isInputFocused) { activeEl.blur(); return; }
        if (document.querySelector('.bottom-sheet.active')) closeAllSheets();
        else navigator.app.exitApp();
    }, false);

    if (window.cordova && cordova.plugins && cordova.plugins.notification && cordova.plugins.notification.local) {
        cordova.plugins.notification.local.hasPermission(granted => {
            if (!granted) {
                cordova.plugins.notification.local.requestPermission(g => { if (g) updateNotifications(); });
            } else {
                updateNotifications();
            }
        });
    }
}, false);

window.addEventListener('popstate', () => {
    const activeEl       = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    if (isInputFocused) { activeEl.blur(); history.pushState({ sheetOpen: true }, ''); return; }
    if (document.querySelector('.bottom-sheet.active')) closeAllSheets(true);
});

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker registration failed:', err));
    });
}

// ─── Responsive re-render on fold/unfold & orientation change ─────────────────

let _resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => renderCalendar(), 200);
});
window.addEventListener('orientationchange', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => renderCalendar(), 300);
});

// ─── Initial page setup ───────────────────────────────────────────────────────

const gText = document.getElementById('greeting-text');
if (gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;
populateYearSelect();

const cSel = document.getElementById('crew-select');
if (cSel) cSel.value = sysSettings.defaultCrew;
renderCalendar();
