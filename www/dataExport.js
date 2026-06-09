// ─── Data export / import ─────────────────────────────────────────────────────

/** Assemble the full backup payload from localStorage. Shared by file + QR export. */
function buildBackupData() {
    return {
        shifts:      localStorage.getItem(STORAGE_KEYS.SHIFTS),
        settings:    localStorage.getItem(STORAGE_KEYS.SETTINGS),
        rotation:    localStorage.getItem(STORAGE_KEYS.ROTATION),
        synced:      localStorage.getItem(STORAGE_KEYS.SYNCED_EVENTS),
        taxTables:   localStorage.getItem(STORAGE_KEYS.TAX_TABLES),
        taxFetched:  localStorage.getItem(STORAGE_KEYS.TAX_FETCHED),
        paystubs:    localStorage.getItem(STORAGE_KEYS.PAYSTUBS),
        extraPay:    localStorage.getItem(STORAGE_KEYS.EXTRA_PAY)
    };
}

/** Restore a parsed backup object into localStorage + live state, then refresh UI.
 *  Shared by file import and QR-scan restore. */
function applyBackupObject(data) {
    localStorage.setItem(STORAGE_KEYS.SHIFTS,        typeof data.shifts   === 'string' ? data.shifts   : JSON.stringify(data.shifts   || {}));
    localStorage.setItem(STORAGE_KEYS.SETTINGS,      typeof data.settings === 'string' ? data.settings : JSON.stringify(data.settings || {}));
    localStorage.setItem(STORAGE_KEYS.ROTATION,      typeof data.rotation === 'string' ? data.rotation : JSON.stringify(data.rotation || {}));
    localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, typeof data.synced   === 'string' ? data.synced   : JSON.stringify(data.synced   || {}));
    if (data.taxTables)  localStorage.setItem(STORAGE_KEYS.TAX_TABLES,  typeof data.taxTables  === 'string' ? data.taxTables  : JSON.stringify(data.taxTables));
    if (data.taxFetched) localStorage.setItem(STORAGE_KEYS.TAX_FETCHED, data.taxFetched);
    if (data.paystubs)   localStorage.setItem(STORAGE_KEYS.PAYSTUBS,    typeof data.paystubs   === 'string' ? data.paystubs   : JSON.stringify(data.paystubs));
    if (data.extraPay)   localStorage.setItem(STORAGE_KEYS.EXTRA_PAY,   typeof data.extraPay   === 'string' ? data.extraPay   : JSON.stringify(data.extraPay));

    extraShifts  = safeParse(STORAGE_KEYS.SHIFTS,        {});
    savedRot     = safeParse(STORAGE_KEYS.ROTATION,      { date: '2026-04-20', offset: 0 });
    // Guard against a backup with a missing/empty rotation, which would leave
    // savedRot without a date and break every getPIndex() lookup.
    if (!savedRot || !savedRot.date) {
        savedRot = { date: '2026-04-20', offset: 0 };
        localStorage.setItem(STORAGE_KEYS.ROTATION, JSON.stringify(savedRot));
    }
    sysSettings  = safeParse(STORAGE_KEYS.SETTINGS,      {});
    syncedEvents = safeParse(STORAGE_KEYS.SYNCED_EVENTS, {});
    taxTables    = safeParse(STORAGE_KEYS.TAX_TABLES,    null);

    initDefaults();
    applyTheme(sysSettings.theme);

    const gText = document.getElementById('greeting-text');
    if (gText) gText.innerHTML = `<span>${sysSettings.displayName}</span>`;

    const cSel = document.getElementById('crew-select');
    if (cSel) cSel.value = sysSettings.defaultCrew;

    populateYearSelect();
    invalidateFatigueCache();
    renderCalendar();
    updateNotifications();
    showToast('Backup Restored Successfully!');
    closeAllSheets();
}

async function exportData() {
    haptic();
    const data = buildBackupData();
    const jsonString = JSON.stringify(data);
    const fileName   = `ShiftHub_Backup_${toDateKey(Date.now())}.json`;
    markBackupDone();

    // Cordova: write a real file to cache dir then share its path (no size limits)
    if (window.cordova && window.cordova.file && window.plugins && window.plugins.socialsharing) {
        _cordovaWriteAndShare(jsonString, fileName);
        return;
    }

    // Browser: Web Share API with proper canShare guard
    const shareFile = new File([jsonString], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        try {
            await navigator.share({ files: [shareFile], title: 'Shift Hub Backup' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }

    // Clipboard last resort
    try {
        await navigator.clipboard.writeText(jsonString);
        showToast('Backup COPIED to clipboard! Paste into your notes/email to save.', 'success');
    } catch (e) {
        showToast('Export failed. Try again.', 'error');
    }
}

function _cordovaWriteAndShare(jsonString, fileName) {
    window.resolveLocalFileSystemURL(window.cordova.file.cacheDirectory, function(dirEntry) {
        dirEntry.getFile(fileName, { create: true, exclusive: false }, function(fileEntry) {
            fileEntry.createWriter(function(fileWriter) {
                fileWriter.onwriteend = function() {
                    window.plugins.socialsharing.shareWithOptions({
                        message: 'Here is your Shift Hub backup.',
                        subject: fileName,
                        files: [fileEntry.nativeURL]
                    }, null, function() {
                        showToast('Share failed. Try again.', 'error');
                    });
                };
                fileWriter.onerror = function() { showToast('Failed to write backup file.', 'error'); };
                fileWriter.write(new Blob([jsonString], { type: 'application/json' }));
            }, function() { showToast('Failed to create backup file.', 'error'); });
        }, function() { showToast('Failed to access storage.', 'error'); });
    }, function() { showToast('Storage not available.', 'error'); });
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            applyBackupObject(JSON.parse(evt.target.result));
        } catch (err) {
            console.error('Import Error: ', err);
            showToast('Invalid backup file. Import failed.', 'error');
        } finally {
            document.getElementById('import-file').value = '';
        }
    };
    reader.readAsText(file);
}