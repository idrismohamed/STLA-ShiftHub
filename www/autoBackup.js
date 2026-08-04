// ─── Auto-backup safety net ───────────────────────────────────────────────────
// All app data lives in localStorage, which the OS can evict. This module keeps
// an automatic compressed snapshot (same SHB1 format as the QR transfer) in a
// second storage engine — the app-private Cordova data directory on device,
// IndexedDB in the browser/PWA — refreshed shortly after every data change.
// On launch, if localStorage turns up empty but a snapshot exists, the user is
// offered a one-tap restore. Also requests persistent-storage protection so the
// browser is far less likely to evict site data in the first place.

const AUTOBACKUP_FILE  = 'autobackup.shb';
const AUTOBACKUP_DB    = 'shifthub-autobackup';
const AUTOBACKUP_STORE = 'snapshots';

let _storagePersisted = null;   // true/false once known; null = unsupported
let _snapshotTimer    = null;
let _lastSnapshotAt   = 0;

/** Ask the browser to protect site data from storage-pressure eviction. */
function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted()
        .then(p => p || navigator.storage.persist())
        .then(granted => { _storagePersisted = granted; })
        .catch(() => {});
}

// ── IndexedDB backend (browser/PWA) ──────────────────────────────────────────

function _abIdbOpen() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('no idb'));
        const req = indexedDB.open(AUTOBACKUP_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(AUTOBACKUP_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function _abIdbWrite(record) {
    return _abIdbOpen().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(AUTOBACKUP_STORE, 'readwrite');
        tx.objectStore(AUTOBACKUP_STORE).put(record, 'latest');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error); };
    }));
}

function _abIdbRead() {
    return _abIdbOpen().then(db => new Promise((resolve, reject) => {
        const tx  = db.transaction(AUTOBACKUP_STORE, 'readonly');
        const req = tx.objectStore(AUTOBACKUP_STORE).get('latest');
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror   = () => { db.close(); reject(req.error); };
    }));
}

// ── Cordova file backend (device) ────────────────────────────────────────────

function _abFileWrite(record) {
    return new Promise((resolve, reject) => {
        if (!(window.cordova && window.cordova.file && window.resolveLocalFileSystemURL)) return reject(new Error('no fs'));
        window.resolveLocalFileSystemURL(window.cordova.file.dataDirectory, dirEntry => {
            dirEntry.getFile(AUTOBACKUP_FILE, { create: true, exclusive: false }, fileEntry => {
                fileEntry.createWriter(writer => {
                    writer.onwriteend = resolve;
                    writer.onerror    = reject;
                    writer.write(new Blob([JSON.stringify(record)], { type: 'application/json' }));
                }, reject);
            }, reject);
        }, reject);
    });
}

function _abFileRead() {
    return new Promise((resolve, reject) => {
        if (!(window.cordova && window.cordova.file && window.resolveLocalFileSystemURL)) return reject(new Error('no fs'));
        window.resolveLocalFileSystemURL(window.cordova.file.dataDirectory, dirEntry => {
            dirEntry.getFile(AUTOBACKUP_FILE, { create: false }, fileEntry => {
                fileEntry.file(file => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        try { resolve(JSON.parse(reader.result)); } catch (e) { resolve(null); }
                    };
                    reader.onerror = reject;
                    reader.readAsText(file);
                }, reject);
            }, () => resolve(null));   // file doesn't exist yet
        }, reject);
    });
}

// ── Snapshot write / read / restore ──────────────────────────────────────────

/** Write the snapshot now (both backends where available). */
async function autoSnapshot() {
    let record;
    try {
        record = { payload: backupPayload(), at: Date.now() };
    } catch (e) { return; }
    const writes = [_abIdbWrite(record).catch(() => {})];
    if (window.cordova && window.cordova.file) writes.push(_abFileWrite(record).catch(() => {}));
    await Promise.all(writes);
    _lastSnapshotAt = record.at;
}

/** Debounced change hook — call after any persisted data mutation. */
function dataChanged() {
    clearTimeout(_snapshotTimer);
    _snapshotTimer = setTimeout(autoSnapshot, 5000);
}

/** Read the freshest snapshot from whichever backend has one. */
async function readAutoSnapshot() {
    const [fromFile, fromIdb] = await Promise.all([
        _abFileRead().catch(() => null),
        _abIdbRead().catch(() => null)
    ]);
    if (fromFile && fromIdb) return (fromFile.at >= fromIdb.at) ? fromFile : fromIdb;
    return fromFile || fromIdb || null;
}

/**
 * On launch: if localStorage came up empty but an auto-snapshot exists,
 * offer a one-tap restore (toast with action, like the shift-undo toast).
 */
async function maybeRestoreFromSnapshot() {
    if (Object.keys(extraShifts).length > 0) { _initLastSnapshotAt(); return; }
    const snap = await readAutoSnapshot();
    if (!snap || !snap.payload) return;
    _lastSnapshotAt = snap.at || 0;

    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'native-toast error';
    toast.style.pointerEvents = 'auto';
    toast.style.justifyContent = 'space-between';

    const text = document.createElement('span');
    const ago  = snap.at ? _abTimeAgo(snap.at) : '';
    text.textContent = `No data found — restore auto-backup${ago ? ' from ' + ago : ''}?`;

    const btn = document.createElement('button');
    btn.className = 'toast-undo-btn';
    btn.textContent = 'RESTORE';
    btn.onclick = () => {
        // restoreFromPayload writes localStorage + refreshes state; reload so
        // every launch-time path (onboarding, coachmarks, greeting) resets too.
        if (restoreFromPayload(snap.payload)) setTimeout(() => location.reload(), 400);
        else showToast('Auto-backup could not be read.', 'error');
    };

    toast.appendChild(text);
    toast.appendChild(btn);
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 20000);
}

/** Seed the last-snapshot timestamp for the Settings status row. */
function _initLastSnapshotAt() {
    readAutoSnapshot().then(s => { if (s && s.at) _lastSnapshotAt = s.at; }).catch(() => {});
}

function _abTimeAgo(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)} days ago`;
}

/** Fill the Settings status row (called when the settings sheet opens). */
function updateAutoBackupStatus() {
    const el = document.getElementById('autobackup-status');
    if (!el) return;
    const prot = _storagePersisted === null ? '' :
        (_storagePersisted ? 'Storage protected · ' : 'Storage not protected · ');
    const snap = _lastSnapshotAt ? `snapshot ${_abTimeAgo(_lastSnapshotAt)}` : 'no snapshot yet';
    el.textContent = prot + snap;
}
