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
    document.querySelectorAll('.bottom-sheet').forEach(s => {
        s.classList.remove('active');
        s.style.transform = '';
    });
    const overlay = document.getElementById('overlay');
    if (overlay) { overlay.style.opacity = '0'; overlay.style.transition = 'opacity 0.3s'; }
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 300);
    if (fromHistory !== true) history.back();
}

// ── Sheet drag-to-dismiss ─────────────────────────────────────────────────
(function () {
    let _sheet = null, _startY = 0, _lastY = 0, _lastT = 0, _velY = 0, _dy = 0, _active = false;

    const THRESHOLD_PX  = 110;   // drag distance to commit dismiss
    const THRESHOLD_VEL = 0.45;  // px/ms velocity to commit dismiss
    const DEAD_ZONE     = 6;     // px before drag locks in

    function getScrollParent(el) {
        while (el && el !== document.body) {
            if (el.scrollTop > 0) return el;
            el = el.parentElement;
        }
        return null;
    }

    document.addEventListener('touchstart', function (e) {
        const sheet = e.target.closest('.bottom-sheet.active');
        if (!sheet) return;
        // If any scrollable ancestor inside the sheet is scrolled down, don't intercept
        if (getScrollParent(e.target)) return;
        _sheet  = sheet;
        _startY = e.touches[0].clientY;
        _lastY  = _startY;
        _lastT  = Date.now();
        _velY   = 0;
        _dy     = 0;
        _active = false;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!_sheet) return;
        const y  = e.touches[0].clientY;
        const dy = y - _startY;
        if (dy <= 0) { _sheet = null; return; } // upward — not a dismiss gesture

        const now = Date.now(), dt = now - _lastT;
        if (dt > 0) _velY = (y - _lastY) / dt;
        _lastY = y; _lastT = now;

        if (!_active) {
            if (dy < DEAD_ZONE) return;
            _active = true;
            _sheet.style.transition = 'none';
        }

        _dy = dy;
        // Proportionally fade the overlay
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.opacity = String(Math.max(0, 0.5 - (dy / 320)));

        _sheet.style.transform = `translateY(${dy}px)`;
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', function () {
        if (!_sheet || !_active) { _sheet = null; _active = false; return; }
        const sheet   = _sheet;
        const dy      = _dy;
        const vel     = _velY;
        _sheet = null; _active = false;

        const dismiss = dy > THRESHOLD_PX || vel > THRESHOLD_VEL;

        if (dismiss) {
            haptic();
            sheet.style.transition = 'transform 0.26s cubic-bezier(0.4,0,1,1)';
            sheet.style.transform  = 'translateY(110%)';
            const overlay = document.getElementById('overlay');
            if (overlay) { overlay.style.transition = 'opacity 0.2s ease'; overlay.style.opacity = '0'; }
            setTimeout(() => {
                sheet.style.transition = '';
                sheet.style.transform  = '';
                sheet.classList.remove('active');
                document.body.style.overflow = '';
                if (overlay) setTimeout(() => { overlay.style.display = 'none'; overlay.style.transition = ''; }, 50);
                history.back();
            }, 260);
        } else {
            // Spring back
            sheet.style.transition = 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1)';
            sheet.style.transform  = 'translateY(0)';
            const overlay = document.getElementById('overlay');
            if (overlay) { overlay.style.transition = 'opacity 0.2s ease'; overlay.style.opacity = '0.5'; }
            setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = ''; }, 420);
        }
    });
}());
