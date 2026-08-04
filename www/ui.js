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
    // Status icon + message (icon() from icons.js; fall back to text-only)
    if (typeof icon === 'function') {
        toast.innerHTML = icon(type === 'error' ? 'alert' : 'check', 15);
        const span = document.createElement('span');
        span.textContent = msg;
        toast.appendChild(span);
    } else {
        toast.innerText = msg;
    }
    container.appendChild(toast);
    haptic();
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showToastWithUndo(msg, dateKey, payload) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'native-toast error';
    toast.style.pointerEvents = 'auto';
    toast.style.justifyContent = 'space-between';

    const text = document.createElement('span');
    text.textContent = msg;

    const btn = document.createElement('button');
    btn.className = 'toast-undo-btn';
    btn.textContent = 'UNDO';

    toast.appendChild(text);
    toast.appendChild(btn);
    container.appendChild(toast);
    haptic();
    setTimeout(() => toast.classList.add('show'), 10);

    const autoRemove = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    btn.onclick = () => {
        clearTimeout(autoRemove);
        extraShifts[dateKey] = payload;
        try { localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts)); } catch(e) {}
        invalidateFatigueCache();
        if (typeof dataChanged === 'function') dataChanged();
        renderCalendar();
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };
}

// ── Sheet navigation stack ────────────────────────────────────────────────
// Sheets form a back-stack. Opening B from A stacks B above A (A stays visible
// underneath); going back pops B and reveals A; only when the last sheet closes
// do we return home. Each opened sheet gets an incrementing z-index so a child
// always paints above its parent regardless of DOM order.
let _sheetStack = [];

function _ensureOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    if (overlay._motionCancel) { overlay._motionCancel(); overlay._motionCancel = null; }
    overlay.style.display = 'block';
    const a = window.Motion?.animate(overlay, { opacity: 1 }, { duration: 0.25, easing: 'ease' });
    if (a) overlay._motionCancel = () => a.cancel();
    else overlay.style.opacity = '1';
}

function _hideOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    if (overlay._motionCancel) { overlay._motionCancel(); overlay._motionCancel = null; }
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s';
    setTimeout(() => { overlay.style.display = 'none'; overlay.style.transition = ''; }, 300);
}

function openSheet(id) {
    if (_sheetStack[_sheetStack.length - 1] === id) return; // already on top
    document.body.style.overflow = 'hidden';
    const target = document.getElementById(id);
    if (!target) return;
    if (target._motionCancel) { target._motionCancel(); target._motionCancel = null; }
    target.style.transform = '';
    target.style.zIndex = String(100 + _sheetStack.length); // sit above the parent sheet
    _ensureOverlay();
    setTimeout(() => target.classList.add('active'), 10);
    _sheetStack.push(id);
    history.pushState({ sheet: id }, '');
}

/**
 * Pop the top sheet (slide it down, reveal the parent). This is the single place
 * that mutates the stack on "back"; it's driven by popstate so that buttons, the
 * overlay tap, swipe-down and hardware back all funnel through history.back().
 */
function _popSheet() {
    if (!_sheetStack.length) return;
    const top = _sheetStack.pop();
    if (top === 'sheet-scan' && typeof stopBackupScan === 'function') stopBackupScan();
    const el = document.getElementById(top);
    if (el) {
        if (el._motionCancel) { el._motionCancel(); el._motionCancel = null; }
        const finalize = () => {
            el._motionCancel = null;
            el.style.transition = 'none';
            el.classList.remove('active');
            el.style.transform = '';
            el.style.zIndex = '';
            requestAnimationFrame(() => { el.style.transition = ''; });
        };
        el.style.transition = 'none';
        const a = window.Motion?.animate(el, { transform: 'translateY(110%)' }, { duration: 0.28, easing: [0.4, 0, 0.6, 1] });
        if (a) { el._motionCancel = () => a.cancel(); a.then(finalize); }
        else {
            el.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.6,1)';
            el.style.transform = 'translateY(110%)';
            el.addEventListener('transitionend', function h() { el.removeEventListener('transitionend', h); finalize(); }, { once: true });
        }
    }
    if (_sheetStack.length) _ensureOverlay();          // parent revealed; restore dim
    else { document.body.style.overflow = ''; _hideOverlay(); }
}

/** Go back one sheet (Close/Cancel buttons, overlay tap, swipe-down, hardware back). */
function sheetBack() { if (_sheetStack.length) history.back(); }

/** Close the entire stack back to the home screen (used after save/restore). */
function closeAllSheets(fromHistory = false) {
    const depth = _sheetStack.length;
    if (!depth && !document.querySelector('.bottom-sheet.active')) return;
    if (typeof stopBackupScan === 'function') stopBackupScan();
    _sheetStack = [];
    document.body.style.overflow = '';
    document.querySelectorAll('.bottom-sheet').forEach(s => {
        if (s._motionCancel) { s._motionCancel(); s._motionCancel = null; }
        s.classList.remove('active');
        s.style.transform = '';
        s.style.zIndex = '';
    });
    _hideOverlay();
    if (fromHistory !== true && depth > 0) history.go(-depth);
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

        // Restore overlay to fully-open opacity (matches what openSheet set).
        if (overlay) {
            _cancelOverlay(overlay);
            const oa = window.Motion?.animate(overlay, { opacity: 1 }, { duration: 0.3, easing: 'ease' });
            if (oa) overlay._motionCancel = () => oa.cancel();
            else { overlay.style.transition = 'opacity 0.3s ease'; overlay.style.opacity = '1'; }
        }
    }

    function dismiss(sheet) {
        haptic();
        // Hand off to the nav stack: going back animates this (top) sheet out
        // from its current dragged position and reveals the parent, or returns
        // home when it's the last sheet. Falls back to a local close if the
        // dragged sheet isn't the tracked top.
        if (_sheetStack.length && _sheetStack[_sheetStack.length - 1] === sheet.id) {
            sheetBack();
        } else {
            closeAllSheets();
        }
    }

    document.addEventListener('touchstart', function (e) {
        const ctxMenu = document.getElementById('ctx-menu');
        if (ctxMenu && ctxMenu.style.display === 'block') return;
        const sheet = e.target.closest('.bottom-sheet.active');
        if (!sheet) return;
        if (getScrollParent(e.target)) return;
        // Cancel any in-progress animation and reset the transform so a new
        // drag starts from the correct (fully-open) position.
        if (sheet._motionCancel) { sheet._motionCancel(); sheet._motionCancel = null; }
        sheet.style.transform = '';
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
        // Fade overlay from 1 (open) to 0 (dismissed) proportionally with drag.
        if (overlay) overlay.style.opacity = String(Math.max(0, 1 - translated / 180));

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
