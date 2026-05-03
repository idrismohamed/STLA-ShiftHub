// ─── Theme management ───────────────────────────────────────────────────────

function applyTheme(themeVal) {
    let isLight = false;
    if (themeVal === 'system') {
        isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', isLight ? '#f2f2f7' : '#121212');
    } else {
        document.documentElement.setAttribute('data-theme', themeVal);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', themeVal === 'light' ? '#f2f2f7' : '#121212');
        isLight = (themeVal === 'light');
    }
    if (window.StatusBar) {
        if (isLight) { StatusBar.backgroundColorByHexString('#f2f2f7'); StatusBar.styleDefault(); }
        else         { StatusBar.backgroundColorByHexString('#121212'); StatusBar.styleLightContent(); }
    }
}