/** Trigger a short vibration for tactile feedback. */
function haptic() {
    if (navigator.vibrate) navigator.vibrate(10);
}

/**
 * Display a temporary toast notification.
 * @param {string} msg
 * @param {'success'|'error'} [type='success']
 */
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `native-toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    haptic();
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Slide a bottom sheet into view and push a history entry so the back button closes it.
 * @param {string} id  element id of the sheet
 */
function openSheet(id) {
    document.body.style.overflow = 'hidden';
    const overlay = document.getElementById('overlay');
    const sheet   = document.getElementById(id);
    if (overlay) overlay.style.display = 'block';
    setTimeout(() => {
        if (overlay) overlay.style.opacity = '1';
        if (sheet)   sheet.classList.add('active');
    }, 10);
    history.pushState({ sheetOpen: true }, '');
}

/**
 * Close all open bottom sheets and restore scroll.
 * @param {boolean} [fromHistory=false]  true when called from a popstate handler (skip history.back())
 */
function closeAllSheets(fromHistory = false) {
    const isActive = document.querySelector('.bottom-sheet.active') !== null;
    if (!isActive) return;
    document.body.style.overflow = '';
    document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.opacity = '0';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 300);
    if (fromHistory !== true) history.back();
}
