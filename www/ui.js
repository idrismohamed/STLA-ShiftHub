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

function openSheet(id) {
    document.body.style.overflow = 'hidden';
    const overlay = document.getElementById('overlay');
    const sheet   = document.getElementById(id);
    if (overlay) { overlay.style.display = 'block'; overlay.style.opacity = '0'; }
    setTimeout(() => {
        if (overlay) {
            if (overlay._motionCancel) { overlay._motionCancel(); overlay._motionCancel = null; }
            const oa = window.Motion?.animate(overlay, { opacity: 1 }, { duration: 0.3, easing: 'ease' });
            if (oa) overlay._motionCancel = () => oa.cancel();
            else overlay.style.opacity = '1';
        }
        if (sheet) sheet.classList.add('active');
    }, 10);
    history.pushState({ sheetOpen: true }, '');
}

function closeAllSheets(fromHistory = false) {
    const isActive = document.querySelector('.bottom-sheet.active') !== null;
    if (!isActive) return;
    document.body.style.overflow = '';
    document.querySelectorAll('.bottom-sheet').forEach(s => {
        if (s._motionCancel) { s._motionCancel(); s._motionCancel = null; }
        s.classList.remove('active');
        s.style.transform = '';
    });
    const overlay = document.getElementById('overlay');
    if (overlay) {
        if (overlay._motionCancel) { overlay._motionCancel(); overlay._motionCancel = null; }
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
    }
    setTimeout(() => {
        if (overlay) { overlay.style.display = 'none'; overlay.style.transition = ''; }
    }, 300);
    if (fromHistory !== true) history.back();
}

// ── Sheet drag-to-dismiss ─────────────────────────────────────────────────
(function () {
    let _sheet = null, _startY = 0, _dy = 0, _active = false;
    let _trail = [];

    const THRESHOLD_PX  = 80;
    const THRESHOLD_VEL = 0.35;
    const DEAD_ZONE     = 10;

    function getScrollParent(el) {
        while (el && el !== document.body) {
            if (el.scrollTop > 0) return el;
            el = el.parentElement;
        }
        return null;
    }

    function calcVelocity() {
        const now = Date.now();
        const w = _trail.filter(p => now - p.t < 100);
        if (w.length < 2) return 0;
        const dt = w[w.length - 1].t - w[0].t;
        return dt > 0 ? (w[w.length - 1].y - w[0].y) / dt : 0;
    }

    function damp(dy) {
        const FREE = 60;
        return dy <= FREE ? dy : FREE + (dy - FREE) * 0.4;
    }

    function _cancelOverlay(overlay) {
        if (overlay && overlay._motionCancel) { overlay._motionCancel(); overlay._motionCancel = null; }
    }

    function snapBack(sheet) {
        const overlay = document.getElementById('overlay');
        if (sheet._motionCancel) { sheet._motionCancel(); sheet._motionCancel = null; }
        sheet.style.transition = 'none';

        const anim = window.Motion?.animate(sheet,
            { transform: 'translateY(0px)' },
            { type: 'spring', stiffness: 280, damping: 18, mass: 0.75 }
        );
        if (anim) {
            sheet._motionCancel = () => anim.cancel();
            anim.then(() => { sheet._motionCancel = null; sheet.style.transform = ''; });
        } else {
            sheet.style.transition = 'transform 0.44s cubic-bezier(0.34,1.56,0.64,1)';
            sheet.style.transform  = 'translateY(0)';
            sheet.addEventListener('transitionend', function h() {
                sheet.removeEventListener('transitionend', h);
                sheet.style.transition = '';
                sheet.style.transform  = '';
            }, { once: true });
        }

        if (overlay) {
            _cancelOverlay(overlay);
            const oa = window.Motion?.animate(overlay, { opacity: 0.5 }, { duration: 0.3, easing: 'ease' });
            if (oa) overlay._motionCancel = () => oa.cancel();
            else { overlay.style.transition = 'opacity 0.3s ease'; overlay.style.opacity = '0.5'; }
        }
    }

    function dismiss(sheet) {
        haptic();
        const overlay = document.getElementById('overlay');
        if (sheet._motionCancel) { sheet._motionCancel(); sheet._motionCancel = null; }
        sheet.style.transition = 'none';

        const anim = window.Motion?.animate(sheet,
            { transform: 'translateY(110%)' },
            { duration: 0.3, easing: [0.4, 0, 0.6, 1] }
        );
        if (anim) {
            sheet._motionCancel = () => anim.cancel();
            anim.then(() => {
                sheet._motionCancel = null;
                sheet.style.transform = '';
                sheet.classList.remove('active');
                document.body.style.overflow = '';
                if (overlay) overlay.style.display = 'none';
                history.back();
            });
        } else {
            sheet.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.6,1)';
            sheet.style.transform  = 'translateY(110%)';
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

        if (overlay) {
            _cancelOverlay(overlay);
            const oa = window.Motion?.animate(overlay, { opacity: 0 }, { duration: 0.22, easing: 'ease' });
            if (oa) overlay._motionCancel = () => oa.cancel();
            else { overlay.style.transition = 'opacity 0.22s ease'; overlay.style.opacity = '0'; }
        }
    }

    document.addEventListener('touchstart', function (e) {
        const sheet = e.target.closest('.bottom-sheet.active');
        if (!sheet) return;
        if (getScrollParent(e.target)) return;
        // Cancel any in-progress Motion animation before a new drag starts
        if (sheet._motionCancel) { sheet._motionCancel(); sheet._motionCancel = null; }
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
            if (dy < 0) { _sheet = null; _trail = []; return; }
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
    document.addEventListener('touchcancel', onRelease);
}());
