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
    let _sheet = null, _startY = 0, _dy = 0, _active = false;
    let _trail = []; // rolling touch points for stable velocity

    const THRESHOLD_PX  = 80;   // px of raw drag to commit dismiss
    const THRESHOLD_VEL = 0.35; // px/ms to commit on a fast flick
    const DEAD_ZONE     = 10;   // px before direction is decided

    function getScrollParent(el) {
        while (el && el !== document.body) {
            if (el.scrollTop > 0) return el;
            el = el.parentElement;
        }
        return null;
    }

    // Average velocity over the last 100 ms — immune to single-frame spikes
    function calcVelocity() {
        const now = Date.now();
        const w = _trail.filter(p => now - p.t < 100);
        if (w.length < 2) return 0;
        const dt = w[w.length - 1].t - w[0].t;
        return dt > 0 ? (w[w.length - 1].y - w[0].y) / dt : 0;
    }

    // Rubber-band: first FREE px are 1:1, beyond that apply resistance
    function damp(dy) {
        const FREE = 60;
        return dy <= FREE ? dy : FREE + (dy - FREE) * 0.4;
    }

    function snapBack(sheet) {
        const overlay = document.getElementById('overlay');
        sheet.style.transition = 'transform 0.44s cubic-bezier(0.34,1.56,0.64,1)';
        sheet.style.transform  = 'translateY(0)';
        if (overlay) { overlay.style.transition = 'opacity 0.3s ease'; overlay.style.opacity = '0.5'; }
        sheet.addEventListener('transitionend', function h() {
            sheet.removeEventListener('transitionend', h);
            sheet.style.transition = '';
            sheet.style.transform  = '';
        }, { once: true });
    }

    function dismiss(sheet) {
        haptic();
        const overlay = document.getElementById('overlay');
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.6,1)';
        sheet.style.transform  = 'translateY(110%)';
        if (overlay) { overlay.style.transition = 'opacity 0.22s ease'; overlay.style.opacity = '0'; }
        sheet.addEventListener('transitionend', function h() {
            sheet.removeEventListener('transitionend', h);
            sheet.style.transition = '';
            sheet.style.transform  = '';
            sheet.classList.remove('active');
            document.body.style.overflow = '';
            if (overlay) { overlay.style.display = 'none'; overlay.style.transition = ''; }
            history.back();
        }, { once: true });
    }

    document.addEventListener('touchstart', function (e) {
        const sheet = e.target.closest('.bottom-sheet.active');
        if (!sheet) return;
        if (getScrollParent(e.target)) return;
        _sheet  = sheet;
        _startY = e.touches[0].clientY;
        _dy     = 0;
        _active = false;
        _trail  = [{ y: _startY, t: Date.now() }];
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!_sheet) return;
        const y  = e.touches[0].clientY;
        const dy = y - _startY;

        if (!_active) {
            if (Math.abs(dy) < DEAD_ZONE) return;
            if (dy < 0) { _sheet = null; _trail = []; return; } // committed upward — let scroll take over
            _active = true;
            _sheet.style.transition = 'none';
        }

        _dy = Math.max(0, dy);

        const now = Date.now();
        _trail.push({ y, t: now });
        if (_trail.length > 30) _trail.shift();

        const translated = damp(_dy);
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.opacity = String(Math.max(0, 0.5 * (1 - translated / 180)));

        _sheet.style.transform = `translateY(${translated}px)`;
        e.preventDefault();
    }, { passive: false });

    function onRelease() {
        if (!_sheet) return;
        const sheet = _sheet;
        _sheet = null;

        if (!_active) { _active = false; _trail = []; return; }
        _active = false;

        const vel = calcVelocity();
        if (_dy > THRESHOLD_PX || vel > THRESHOLD_VEL) {
            dismiss(sheet);
        } else {
            snapBack(sheet);
        }
        _trail = [];
        _dy    = 0;
    }

    document.addEventListener('touchend',    onRelease);
    document.addEventListener('touchcancel', onRelease); // prevents stuck sheets
}());
