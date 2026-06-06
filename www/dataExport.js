// ─── Data export / import ─────────────────────────────────────────────────────

function exportData() {
    haptic();
    const data = {
        shifts:   localStorage.getItem(STORAGE_KEYS.SHIFTS),
        settings: localStorage.getItem(STORAGE_KEYS.SETTINGS),
        rotation: localStorage.getItem(STORAGE_KEYS.ROTATION),
        synced:   localStorage.getItem(STORAGE_KEYS.SYNCED_EVENTS)
    };
    const jsonString = JSON.stringify(data);
    const fileName   = `ShiftHub_Backup_${toDateKey(Date.now())}.json`;

    if (window.plugins && window.plugins.socialsharing) {
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        window.plugins.socialsharing.share('Here is your Shift Hub backup data.', fileName, 'data:application/json;base64,' + base64Data, null);
        showToast('Native Share Menu Opened');
    } else if (navigator.canShare) {
        const file = new File([jsonString], fileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'Shift Hub Backup', text: 'Backup data' }).catch(err => console.log(err));
        }
    } else {
        navigator.clipboard.writeText(jsonString).then(() => {
            showToast('Backup COPIED to clipboard! Paste into your notes/email to save.', 'success');
        });
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

            extraShifts  = safeParse(STORAGE_KEYS.SHIFTS,        {});
            savedRot     = safeParse(STORAGE_KEYS.ROTATION,      { date: '2026-04-20', offset: 0 });
            sysSettings  = safeParse(STORAGE_KEYS.SETTINGS,      {});
            syncedEvents = safeParse(STORAGE_KEYS.SYNCED_EVENTS, {});

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