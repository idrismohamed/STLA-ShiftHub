// ─── Data export / import ─────────────────────────────────────────────────────

async function exportData() {
    haptic();
    const data = {
        shifts:      localStorage.getItem(STORAGE_KEYS.SHIFTS),
        settings:    localStorage.getItem(STORAGE_KEYS.SETTINGS),
        rotation:    localStorage.getItem(STORAGE_KEYS.ROTATION),
        synced:      localStorage.getItem(STORAGE_KEYS.SYNCED_EVENTS),
        taxTables:   localStorage.getItem(STORAGE_KEYS.TAX_TABLES),
        taxFetched:  localStorage.getItem(STORAGE_KEYS.TAX_FETCHED)
    };
    const jsonString = JSON.stringify(data);
    const fileName   = `ShiftHub_Backup_${toDateKey(Date.now())}.json`;
    const file       = new File([jsonString], fileName, { type: 'application/json' });

    // Web Share API with a proper File object — shares via FileProvider, no Intent size limits
    if (navigator.share) {
        try {
            await navigator.share({ files: [file], title: 'Shift Hub Backup' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return; // user cancelled
            // share failed — fall through to socialsharing
        }
    }

    // Socialsharing plugin fallback (base64 data URI — can fail on large backups)
    if (window.plugins && window.plugins.socialsharing) {
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        window.plugins.socialsharing.share('Here is your Shift Hub backup data.', fileName, 'data:application/json;base64,' + base64Data, null);
        showToast('Native Share Menu Opened');
        return;
    }

    // Clipboard last resort
    try {
        await navigator.clipboard.writeText(jsonString);
        showToast('Backup COPIED to clipboard! Paste into your notes/email to save.', 'success');
    } catch (e) {
        showToast('Export failed. Try again.', 'error');
    }
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            localStorage.setItem(STORAGE_KEYS.SHIFTS,        typeof data.shifts   === 'string' ? data.shifts   : JSON.stringify(data.shifts   || {}));
            localStorage.setItem(STORAGE_KEYS.SETTINGS,      typeof data.settings === 'string' ? data.settings : JSON.stringify(data.settings || {}));
            localStorage.setItem(STORAGE_KEYS.ROTATION,      typeof data.rotation === 'string' ? data.rotation : JSON.stringify(data.rotation || {}));
            localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, typeof data.synced   === 'string' ? data.synced   : JSON.stringify(data.synced   || {}));
            if (data.taxTables)  localStorage.setItem(STORAGE_KEYS.TAX_TABLES,  typeof data.taxTables  === 'string' ? data.taxTables  : JSON.stringify(data.taxTables));
            if (data.taxFetched) localStorage.setItem(STORAGE_KEYS.TAX_FETCHED, data.taxFetched);

            extraShifts  = safeParse(STORAGE_KEYS.SHIFTS,        {});
            savedRot     = safeParse(STORAGE_KEYS.ROTATION,      { date: '2026-04-20', offset: 0 });
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
        } catch (err) {
            console.error('Import Error: ', err);
            showToast('Invalid backup file. Import failed.', 'error');
        } finally {
            document.getElementById('import-file').value = '';
        }
    };
    reader.readAsText(file);
}