// ─── Backup hardening: QR transfer + auto-backup reminders ───────────────────
// Device-to-device transfer without a server: the source device renders the
// (compressed) backup as a QR code; the destination scans it with its camera
// and restores. Plus a gentle "time to back up" nudge so data isn't only ever
// one lost phone away. Reuses buildBackupData()/applyBackupObject() from
// dataExport.js, LZString (vendor/lz-string.min.js), qrcode (vendor/qrcode.min.js)
// and jsQR (vendor/jsQR.js).

const BACKUP_PREFIX = 'SHB1:';   // payload tag/version so we only restore our own QRs

/** Compressed, tagged backup string suitable for a QR code. */
function backupPayload() {
    return BACKUP_PREFIX + LZString.compressToBase64(JSON.stringify(buildBackupData()));
}

/** Render the current backup as a QR code and open the transfer sheet. */
function showBackupQR() {
    haptic();
    const host = document.getElementById('backup-qr');
    const note = document.getElementById('backup-qr-note');
    if (!host || !note) return;
    host.innerHTML = '';

    const payload = backupPayload();
    let qr;
    try {
        qr = qrcode(0, 'L');          // auto type-number, low EC = max capacity
        qr.addData(payload);
        qr.make();
    } catch (e) {
        // Too much data for a single QR — fall back to file export.
        note.innerHTML = `Your backup is large (${payload.length.toLocaleString()} chars) and won't fit one QR code. Use <b>Export Backup (.json)</b> instead.`;
        note.style.color = 'var(--night)';
        openSheet('sheet-backupqr');
        return;
    }

    const img = new Image();
    img.src = qr.createDataURL(5, 12);
    img.alt = 'Backup QR code';
    img.className = 'backup-qr-img';
    host.appendChild(img);
    note.textContent = "On your other phone, open Shift Hub → Settings → Restore via QR, and scan this.";
    note.style.color = 'var(--text-muted)';
    openSheet('sheet-backupqr');
}

/** Decompress + restore a scanned/typed payload. Returns true on success. */
function restoreFromPayload(text) {
    if (!text || text.indexOf(BACKUP_PREFIX) !== 0) return false;
    let obj;
    try {
        obj = JSON.parse(LZString.decompressFromBase64(text.slice(BACKUP_PREFIX.length)));
    } catch (e) { return false; }
    if (!obj || typeof obj !== 'object') return false;
    applyBackupObject(obj);   // refreshes UI + closes sheets + toasts success
    return true;
}

// ── QR scanning (camera) ─────────────────────────────────────────────────────
let _scanStream = null, _scanRAF = null;

function openScanSheet() {
    haptic();
    openSheet('sheet-scan');
    startBackupScan();
}

async function startBackupScan() {
    const video  = document.getElementById('scan-video');
    const canvas = document.getElementById('scan-canvas');
    const status = document.getElementById('scan-status');
    if (!video || !canvas) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof jsQR === 'undefined') {
        if (status) status.textContent = 'Camera not available on this device.';
        return;
    }
    if (status) status.textContent = 'Point the camera at the backup QR…';

    try {
        _scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
        if (status) status.textContent = 'Camera permission denied.';
        return;
    }
    video.srcObject = _scanStream;
    video.setAttribute('playsinline', 'true');
    await video.play().catch(() => {});

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
        if (!_scanStream) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
                if (restoreFromPayload(code.data)) { stopBackupScan(); return; }
                if (code.data.indexOf(BACKUP_PREFIX) === 0 && status) status.textContent = 'Backup QR found but could not be read — try again.';
            }
        }
        _scanRAF = requestAnimationFrame(tick);
    };
    _scanRAF = requestAnimationFrame(tick);
}

function stopBackupScan() {
    if (_scanRAF) { cancelAnimationFrame(_scanRAF); _scanRAF = null; }
    if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
    const video = document.getElementById('scan-video');
    if (video) video.srcObject = null;
}

// ── Auto-backup reminder ─────────────────────────────────────────────────────

/** Record that a backup just happened (called from exportData). */
function markBackupDone() {
    sysSettings.lastBackupAt = Date.now();
    try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
}

/** Persist the reminder cadence (days; 0 = off) chosen in Settings. */
function setBackupReminder(days) {
    sysSettings.backupReminderDays = parseInt(days) || 0;
    try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
    haptic();
}

/** On launch: nudge (at most once/day) if backups are overdue. */
function maybeBackupReminder() {
    const days = sysSettings.backupReminderDays || 0;
    if (days <= 0) return;
    const now      = Date.now();
    const last     = sysSettings.lastBackupAt || 0;
    const lastNudge = sysSettings.lastBackupNudge || 0;
    const overdue  = (now - last) > days * MS_DAY;
    const nudgedToday = toDateKey(now) === toDateKey(lastNudge);
    if (overdue && !nudgedToday) {
        sysSettings.lastBackupNudge = now;
        try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
        const ago = last ? Math.floor((now - last) / MS_DAY) + ' days ago' : 'never';
        setTimeout(() => showToast(`Backup reminder: last backup ${ago}. Settings → Export Backup.`, 'error'), 1200);
    }
}
