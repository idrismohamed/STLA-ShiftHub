// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(themeVal) {
    let isLight = false;
    if (themeVal === 'system') {
        isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', isLight ? '#f2f2f7' : '#121212');
    } else {
        document.documentElement.setAttribute('data-theme', themeVal);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', themeVal === 'light' ? '#f2f2f7' : '#121212');
        isLight = (themeVal === 'light');
    }
    if (window.StatusBar) {
        if (isLight) { StatusBar.backgroundColorByHexString('#f2f2f7'); StatusBar.styleDefault(); }
        else         { StatusBar.backgroundColorByHexString('#121212'); StatusBar.styleLightContent(); }
    }
}

applyTheme(sysSettings.theme);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (sysSettings.theme === 'system') applyTheme('system');
});

// ─── Year selector ────────────────────────────────────────────────────────────

function changeYear(dir) {
    const ys  = document.getElementById('year-select');
    const cur = parseInt(ys.value);
    if (cur + dir >= sysSettings.startYear && cur + dir <= sysSettings.endYear) {
        ys.value = cur + dir;
        haptic();
        renderCalendar();
    }
}

function populateYearSelect() {
    const select = document.getElementById('year-select');
    if (!select) return;
    const currentYear = getLogicalToday().getFullYear();
    const currentVal  = select.value;
    select.innerHTML  = '';
    for (let y = sysSettings.startYear; y <= sysSettings.endYear; y++) {
        const opt = document.createElement('option');
        opt.value   = y;
        opt.innerText = y;
        if (currentVal ? (y == currentVal) : (y == currentYear)) opt.selected = true;
        select.appendChild(opt);
    }
}

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
    const fileName   = `STLA_ShiftHub_Backup_${toDateKey(Date.now())}.json`;

    if (window.plugins && window.plugins.socialsharing) {
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        window.plugins.socialsharing.share('Here is your STLA Shift Hub backup data.', fileName, 'data:application/json;base64,' + base64Data, null);
        showToast('Native Share Menu Opened');
    } else if (navigator.canShare) {
        const file = new File([jsonString], fileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'STLA Backup', text: 'Backup data' }).catch(err => console.log(err));
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
            if (gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;

            const cSel = document.getElementById('crew-select');
            if (cSel) cSel.value = sysSettings.defaultCrew;

            populateYearSelect();
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

function exportPDF() {
    haptic();
    if (!window.jspdf) { showToast('PDF Library loading, try again.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF();
    const ppEl = document.querySelector('.pp-card');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('STLA Shift Hub', 15, 20);
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text('Pay Period Summary & Financials', 15, 30);
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(0);

    let y = 45;
    const textLines = ppEl ? ppEl.innerText.split('\n') : ['No data available'];
    textLines.forEach(line => {
        if (line.trim() === '') return;
        doc.setFont('helvetica', (line.includes('Total Worked') || line.includes('Net Pay') || line.includes('Gross')) ? 'bold' : 'normal');
        doc.text(line, 15, y);
        y += 7;
        if (y > 280) { doc.addPage(); y = 20; }
    });

    const fileName = `STLA_Paystub_${Date.now()}.pdf`;
    if (window.plugins && window.plugins.socialsharing) {
        window.plugins.socialsharing.share('Paystub PDF attached.', fileName, doc.output('datauristring'), null);
    } else {
        doc.save(fileName);
        showToast('PDF Generated!');
    }
}

function sharePayPeriod() {
    haptic();
    const ppEl = document.querySelector('.pp-card');
    if (!ppEl) return;
    const textToShare = ppEl.innerText;
    if (window.plugins && window.plugins.socialsharing) {
        window.plugins.socialsharing.share(textToShare, 'STLA Pay Period Summary', null, null);
    } else if (navigator.share) {
        navigator.share({ title: 'STLA Pay Period Summary', text: textToShare }).catch(console.error);
    } else {
        navigator.clipboard.writeText(textToShare).then(() => showToast('Copied to clipboard!'));
    }
}

// ─── Shift form state ─────────────────────────────────────────────────────────

let activeDate = null, activeCurrentShift = null, activeNextShift = null;
let selectedType = null, selectedCrew = null, selectedRole = sysSettings.defaultRole, selectedRotOffset = null;

// ─── Shift form helpers ───────────────────────────────────────────────────────

function clearTimes() {
    haptic();
    const sInput = document.getElementById('input-start-time');
    const eInput = document.getElementById('input-end-time');
    const rInput = document.getElementById('input-ot-reason');
    if (sInput) sInput.value = '';
    if (eInput) eInput.value = '';
    if (rInput) rInput.value = '';
    resetSliders();
    updatePickupToggles();
}

function resetSliders() {
    const otSlider    = document.getElementById('ot-slider');
    const shortSlider = document.getElementById('short-slider');
    if (otSlider)    otSlider.removeAttribute('data-user-modified');
    if (shortSlider) shortSlider.removeAttribute('data-user-modified');
}

function updateSliderLabels() {
    const slider = document.getElementById('ot-slider');
    if (!slider) return;
    slider.setAttribute('data-user-modified', 'true');
    const dt    = parseFloat(slider.value) || 0;
    const extra = parseFloat(slider.max)   || 0;
    const otLabel = document.getElementById('lbl-slider-ot');
    const dtLabel = document.getElementById('lbl-slider-dt');
    if (otLabel) otLabel.innerText = Math.max(0, extra - dt).toFixed(1) + 'h';
    if (dtLabel) dtLabel.innerText = dt.toFixed(1) + 'h';
}

function updateShortSliderLabels() {
    const slider = document.getElementById('short-slider');
    if (!slider) return;
    slider.setAttribute('data-user-modified', 'true');
    const vH    = parseFloat(slider.value) || 0;
    const short = parseFloat(slider.max)   || 0;
    const vacLabel    = document.getElementById('lbl-slider-vac');
    const unpaidLabel = document.getElementById('lbl-slider-unpaid');
    if (vacLabel)    vacLabel.innerText    = vH.toFixed(1) + 'h';
    if (unpaidLabel) unpaidLabel.innerText = Math.max(0, short - vH).toFixed(1) + 'h';
    updatePickupToggles(true);
}

// ─── Shift entry sheet ────────────────────────────────────────────────────────

function openPickupSheet(dStr, disp, curS, nextS) {
    activeDate = dStr; activeCurrentShift = curS; activeNextShift = nextS;
    const sheetDate = document.getElementById('sheet-date');
    if (sheetDate) sheetDate.innerText = disp;

    const ex         = extraShifts[dStr] || {};
    const targetType = ex.type || curS;
    let defS = '', defE = '';

    if      (targetType === 'Day'  || targetType === 'D') { defS = '06:30'; defE = '18:30'; }
    else if (targetType === 'Night'|| targetType === 'N') { defS = '18:30'; defE = '06:30'; }
    else if (targetType === 'DropPaid') { defS = (curS === 'N') ? '18:30' : '06:30'; defE = (curS === 'N') ? '06:30' : '18:30'; }

    if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(targetType) || (targetType === 'O' && selectedType !== 'DropPaid')) {
        defS = ''; defE = '';
    }

    const regRoleBtn = document.getElementById('btn-role-Reg');
    const tlRoleBtn  = document.getElementById('btn-role-TL');
    if (regRoleBtn) regRoleBtn.innerText = `Regular ($${sysSettings.regRate.toFixed(2)})`;
    if (tlRoleBtn)  tlRoleBtn.innerText  = `Team Leader ($${sysSettings.tlRate.toFixed(2)})`;

    selectedType = ex.type || null;
    selectedCrew = normalizeCrew(ex.crew) || null;
    selectedRole = ex.role || sysSettings.defaultRole || 'Reg';

    const manualInput = document.getElementById('manual-rate-input');
    if (manualInput) {
        manualInput.style.display = selectedRole === 'Manual' ? 'block' : 'none';
        manualInput.value         = selectedRole === 'Manual' ? (ex.manualRate || '') : '';
    }

    const stInput = document.getElementById('input-start-time');
    const etInput = document.getElementById('input-end-time');
    if (stInput) stInput.value = ex.startTime || defS;
    if (etInput) etInput.value = ex.endTime   || defE;

    const otSlider = document.getElementById('ot-slider');
    if (otSlider) {
        otSlider.removeAttribute('data-user-modified');
        if (ex.dtHours !== undefined) otSlider.dataset.savedDt = ex.dtHours; else delete otSlider.dataset.savedDt;
    }
    const shortSlider = document.getElementById('short-slider');
    if (shortSlider) {
        shortSlider.removeAttribute('data-user-modified');
        if (ex.vacHours !== undefined) shortSlider.dataset.savedVac = ex.vacHours; else delete shortSlider.dataset.savedVac;
    }

    const cbOverride = document.getElementById('cb-override');
    if (cbOverride) cbOverride.checked = ex.overrideLockout || false;

    const rInput = document.getElementById('input-ot-reason');
    if (rInput) rInput.value = ex.otReason || '';

    updatePickupToggles();

    const btnRemove = document.getElementById('btn-remove');
    if (btnRemove) btnRemove.style.display = Object.keys(ex).length ? 'block' : 'none';
    openSheet('sheet-pickup');
}

function quickLog(template) {
    haptic();
    const stInput = document.getElementById('input-start-time');
    const etInput = document.getElementById('input-end-time');
    const baseS   = (activeCurrentShift === 'D' || activeCurrentShift === 'Day') ? '06:30'
                  : (activeCurrentShift === 'N' || activeCurrentShift === 'Night' ? '18:30' : '06:30');

    if (template === 'early4') {
        if (baseS === '06:30') { stInput.value = '02:30'; etInput.value = '18:30'; }
        else                   { stInput.value = '14:30'; etInput.value = '06:30'; }
    } else if (template === 'late4') {
        if (baseS === '06:30') { stInput.value = '06:30'; etInput.value = '22:30'; }
        else                   { stInput.value = '18:30'; etInput.value = '10:30'; }
    } else if (template === 'vacation') {
        selectType('Vacation');
        return;
    }

    if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) selectedType = null;
    resetSliders();
    updatePickupToggles();
}

function selectRole(r) {
    haptic();
    selectedRole = r;
    const manualInput = document.getElementById('manual-rate-input');
    if (manualInput) manualInput.style.display = (r === 'Manual') ? 'block' : 'none';
    updatePickupToggles();
}

function selectType(t) {
    haptic();
    selectedType = (selectedType === t) ? null : t;
    const stInput = document.getElementById('input-start-time');
    const etInput = document.getElementById('input-end-time');

    if      (selectedType === 'Day')   { if (stInput) stInput.value = '06:30'; if (etInput) etInput.value = '18:30'; }
    else if (selectedType === 'Night') { if (stInput) stInput.value = '18:30'; if (etInput) etInput.value = '06:30'; }
    else if (['DropOff', 'Vacation', 'Off', 'Lieu'].includes(selectedType)) {
        if (stInput) stInput.value = '';
        if (etInput) etInput.value = '';
        const rInput = document.getElementById('input-ot-reason');
        if (rInput) rInput.value = '';
        selectedCrew = null;
    } else if (selectedType === 'DropPaid') {
        if (activeCurrentShift === 'N') { if (stInput) stInput.value = '18:30'; if (etInput) etInput.value = '06:30'; }
        else                            { if (stInput) stInput.value = '06:30'; if (etInput) etInput.value = '18:30'; }
    } else {
        if      (activeCurrentShift === 'D') { if (stInput) stInput.value = '06:30'; if (etInput) etInput.value = '18:30'; }
        else if (activeCurrentShift === 'N') { if (stInput) stInput.value = '18:30'; if (etInput) etInput.value = '06:30'; }
        else { if (stInput) stInput.value = ''; if (etInput) etInput.value = ''; }
    }
    resetSliders();
    updatePickupToggles();
}

function selectCrew(c) { haptic(); selectedCrew = (selectedCrew === c) ? null : c; updatePickupToggles(); }

function addMorningMeeting() {
    haptic();
    const et = document.getElementById('input-end-time');
    if (et) {
        if (!et.value) { const exp = selectedType || activeCurrentShift; et.value = (exp === 'Day' || exp === 'D') ? '18:30' : '06:30'; }
        const [h, m] = et.value.split(':').map(Number);
        et.value = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const otSlider = document.getElementById('ot-slider');
    if (otSlider) otSlider.removeAttribute('data-user-modified');
    updatePickupToggles();
}

// ─── Pickup toggle validation ─────────────────────────────────────────────────

function updatePickupToggles(skipSliderReset = false) {
    document.querySelectorAll('#sheet-pickup .toggle-btn').forEach(b => b.classList.remove('active'));

    const f            = dayFatigue[activeDate];
    const isDropPeriod = f && f.isDropPeriod;
    const activePP     = f ? f.ppIndex : 0;
    const offset       = (((activePP % 3) + 3) % 3);
    const startPP      = activePP - (offset === 1 ? 2 : (offset === 2 ? 0 : 1));

    let hasDropOffInCycle = false, hasAbsenceInCycle = false, hasDropPaidInCycle = false;
    const cycleStartUTC = basePPStartUTC + startPP * MS_PP;
    const cycleEndUTC   = basePPStartUTC + (startPP + 3) * MS_PP;

    for (let u = cycleStartUTC; u < cycleEndUTC; u += MS_DAY) {
        const dS = toDateKey(u);
        if (dS !== activeDate && extraShifts[dS]) {
            if (extraShifts[dS].type === 'DropOff')                                            hasDropOffInCycle  = true;
            if (['Off', 'DropOff', 'Lieu'].includes(extraShifts[dS].type))                     hasAbsenceInCycle  = true;
            if (extraShifts[dS].type === 'DropPaid')                                           hasDropPaidInCycle = true;
        }
    }

    const btnDropPaid = document.getElementById('btn-type-DropPaid');
    const btnDropOff  = document.getElementById('btn-type-DropOff');
    if (btnDropPaid && btnDropOff) {
        btnDropOff.style.display  = 'block';
        btnDropPaid.style.display = isDropPeriod ? 'block' : 'none';
    }

    if (selectedType && ['Day', 'Night'].includes(selectedType)) {
        const btn = document.getElementById('btn-type-' + selectedType);
        if (btn) btn.classList.add('active');
    }
    if (selectedCrew) {
        const btn = document.getElementById('btn-crew-' + selectedCrew);
        if (btn) btn.classList.add('active');
    }
    const activeRoleBtn = document.getElementById('btn-role-' + selectedRole);
    if (activeRoleBtn) activeRoleBtn.classList.add('active');

    const isTimeOff            = ['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType);
    const crewOverrideContainer = document.getElementById('crew-override-container');
    if (crewOverrideContainer) crewOverrideContainer.style.display = isTimeOff ? 'none' : 'block';

    ['Vacation', 'Off', 'DropOff', 'DropPaid', 'Lieu'].forEach(t => {
        const btn = document.getElementById('btn-type-' + t);
        if (!btn) return;
        if (selectedType === t) {
            btn.classList.add('active');
            if (t === 'Vacation') btn.style.background = 'rgba(0, 188, 212, 0.2)';
            if (t === 'Off')      btn.style.background = 'rgba(234, 67, 53, 0.2)';
            if (t === 'Lieu')     btn.style.background = 'rgba(251, 188, 4, 0.2)';
            if (t === 'DropOff')  btn.style.background = 'rgba(66, 133, 244, 0.2)';
            if (t === 'DropPaid') btn.style.background = 'rgba(52, 168, 83, 0.2)';
            btn.style.boxShadow = TIMEOFF_GLOWS[t];
        } else {
            btn.style.background  = 'var(--input-bg)';
            btn.style.boxShadow   = '';
        }
    });

    const wT   = document.getElementById('conflict-text');
    const ovL  = document.getElementById('override-label');
    const bSave = document.getElementById('btn-save');
    if (wT)  wT.innerHTML        = '';
    if (ovL) ovL.style.display   = 'none';
    let hasW = false, canS = true;

    const stInput = document.getElementById('input-start-time');
    const etInput = document.getElementById('input-end-time');
    const st      = stInput ? stInput.value : '';
    const et      = etInput ? etInput.value : '';

    // Vacation limit check
    if (selectedType === 'Vacation') {
        const crewSelect = document.getElementById('crew-select');
        const viewCrew   = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        const ytdVacation = getUsedVacationHours(viewCrew, activeDate, activeDate);
        const base = f ? f.baseWorkHours : 0;
        const dur  = (st && et) ? getDuration(st, et) : 0;
        const vH   = (st && et) ? Math.max(0, (base || 12) - dur) : (base || 12);
        if (ytdVacation + vH > sysSettings.vacationLimit + 0.05) {
            const hrsLeft = Math.max(0, sysSettings.vacationLimit - ytdVacation);
            if (wT) wT.innerHTML += `⚠️ VACATION LIMIT: Cannot book. You only have ${hrsLeft.toFixed(1)} hours remaining for this cycle.<br>`;
            hasW = true; canS = false;
        }
    }

    // Lieu balance check
    if (selectedType === 'Lieu') {
        const crewSelect = document.getElementById('crew-select');
        const viewCrew   = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        const banked     = computeLieuBalance(activeDate, viewCrew, activeDate);
        if (banked <= 0) {
            if (wT) wT.innerHTML += `⚠️ LIEU DAY LIMIT: You have no banked Lieu Days available (current balance: ${banked}).<br>`;
            hasW = true; canS = false;
        }
    }

    if (selectedType === 'DropOff' && hasDropOffInCycle) {
        if (wT) wT.innerHTML += `⚠️ DROP OFF LIMIT: You already took a Drop Off Day in this 6-week cycle.<br>`;
        hasW = true; canS = false;
    }
    if (selectedType === 'DropPaid') {
        if (hasDropPaidInCycle) { if (wT) wT.innerHTML += `⚠️ DROP PAID LIMIT: You already logged a Drop Paid shift in this cycle.<br>`; hasW = true; canS = false; }
        if (hasAbsenceInCycle)  { if (wT) wT.innerHTML += `⚠️ DROP PAID BLOCKED: You have an Unpaid Absence logged in this eligibility cycle.<br>`; hasW = true; canS = false; }
    }

    // Rest-time checks
    if (st && et && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        let currentStart = getFloatTime(st);
        let currentEnd   = getFloatTime(et); if (currentEnd < currentStart) currentEnd += 24;
        const dateObj    = new Date(activeDate + 'T00:00:00Z');
        const crewSelect = document.getElementById('crew-select');
        const crew       = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        const cbOv       = document.getElementById('cb-override');

        const yUTC = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate() - 1);
        const yStr = toDateKey(yUTC);
        const yEnd = getShiftEndFloat(yStr, crew);
        if (yEnd !== null) {
            const restBack = (currentStart + 24) - yEnd;
            if (restBack < 7.95) {
                if (wT)  wT.innerHTML    += `🚨 INSUFFICIENT REST: Only ${restBack.toFixed(1)}h rest since yesterday's shift.<br>`;
                if (ovL) ovL.style.display = 'flex';
                if (!cbOv || !cbOv.checked) canS = false;
            }
        }

        const tUTC  = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate() + 1);
        const tStr  = toDateKey(tUTC);
        const tStart = getShiftStartFloat(tStr, crew);
        if (tStart !== null) {
            const restFwd = (tStart + 24) - currentEnd;
            if (restFwd < 7.95) {
                if (wT)  wT.innerHTML    += `🚨 INSUFFICIENT REST: Only ${restFwd.toFixed(1)}h rest before tomorrow's shift.<br>`;
                if (ovL) ovL.style.display = 'flex';
                if (!cbOv || !cbOv.checked) canS = false;
            }
        }
    }

    // Sleep warning
    if (activeCurrentShift === 'O' && activeNextShift !== 'O' && ['Day', 'Night'].includes(selectedType)) {
        if (activeNextShift === 'N' && selectedType === 'Day')  { if (wT) wT.innerHTML += '⚠️ SLEEP WARNING: Nights tomorrow!<br>'; hasW = true; }
        if (activeNextShift === 'D' && selectedType === 'Night') { if (wT) wT.innerHTML += '⚠️ SLEEP WARNING: Days tomorrow!<br>';  hasW = true; }
    }

    let base  = f ? f.baseWorkHours : 0;
    const cbOv = document.getElementById('cb-override');
    if (f && f.isLockout && cbOv && cbOv.checked) base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    if (['DropPaid', 'DropOff', 'Lieu'].includes(selectedType)) base = 0;

    const dur   = (st && et) ? getDuration(st, et) : 0;
    const extra = Math.max(0, dur - base);
    const short = Math.max(0, base - dur);

    const otS        = document.getElementById('section-ot-rate');
    const otSlider   = document.getElementById('ot-slider');
    const shortS     = document.getElementById('section-short-shift');
    const shortSlider = document.getElementById('short-slider');

    function setShortShiftMode(mode, html = '') {
        if (!shortS) return;
        let msgBox = document.getElementById('short-shift-msgbox');
        if (!msgBox) { msgBox = document.createElement('div'); msgBox.id = 'short-shift-msgbox'; shortS.appendChild(msgBox); }
        if (mode === 'message') {
            Array.from(shortS.children).forEach(c => { if (c.id !== 'short-shift-msgbox') c.style.display = 'none'; });
            msgBox.style.display = 'block';
            msgBox.innerHTML     = html;
        } else {
            Array.from(shortS.children).forEach(c => { if (c.id !== 'short-shift-msgbox') c.style.display = ''; });
            msgBox.style.display = 'none';
        }
    }

    if (selectedType === 'Vacation') {
        if (shortS) { shortS.style.display = 'block'; shortS.style.background = 'rgba(0, 188, 212, 0.1)'; shortS.style.borderColor = 'rgba(0, 188, 212, 0.3)'; }
        const vH = (st && et) ? short : (base || 12);
        setShortShiftMode('message', `<div class="sheet-label" style="color: #00bcd4; margin-bottom: 0;">🏖️ ${vH.toFixed(1)} hours logged as Vacation</div>`);
    } else if (selectedType === 'Off') {
        if (shortS) { shortS.style.display = 'block'; shortS.style.background = 'rgba(234, 67, 53, 0.1)'; shortS.style.borderColor = 'rgba(234, 67, 53, 0.3)'; }
        const uH = (st && et) ? short : (base || 12);
        setShortShiftMode('message', `<div class="sheet-label" style="color: var(--night); margin-bottom: 0;">⚠️ ${uH.toFixed(1)} hours logged as Unpaid</div>`);
    } else if (selectedType === 'Lieu') {
        if (shortS) { shortS.style.display = 'block'; shortS.style.background = 'rgba(251, 188, 4, 0.1)'; shortS.style.borderColor = 'rgba(251, 188, 4, 0.3)'; }
        const uH = (st && et) ? short : (base || 12);
        setShortShiftMode('message', `<div class="sheet-label" style="color: #fbbc04; margin-bottom: 0;">🏛️ ${uH.toFixed(1)} hours logged as Lieu Day</div>`);
    } else if (short > 0.05 && dur > 0 && selectedType !== 'DropPaid') {
        if (shortS) { shortS.style.display = 'block'; shortS.style.background = 'var(--card)'; shortS.style.borderColor = 'var(--border)'; }
        setShortShiftMode('slider');
        const dsh = document.getElementById('display-short-hours');
        if (dsh) dsh.innerText = short.toFixed(1);
        if (shortSlider) {
            shortSlider.max = short;
            if (!skipSliderReset) {
                if (shortSlider.dataset.savedVac !== undefined) { shortSlider.value = shortSlider.dataset.savedVac; shortSlider.setAttribute('data-user-modified', 'true'); delete shortSlider.dataset.savedVac; }
                else if (!shortSlider.hasAttribute('data-user-modified')) shortSlider.value = 0;
                else if (parseFloat(shortSlider.value) > short) shortSlider.value = short;
            }
            const vH = parseFloat(shortSlider.value) || 0;
            const lsv = document.getElementById('lbl-slider-vac');
            const lsu = document.getElementById('lbl-slider-unpaid');
            if (lsv) lsv.innerText = vH.toFixed(1) + 'h';
            if (lsu) lsu.innerText = (short - vH).toFixed(1) + 'h';
        }
    } else {
        if (shortS) shortS.style.display = 'none';
    }

    if (extra > 0.05 && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        if (otS) otS.style.display = 'block';
        const deh = document.getElementById('display-extra-hours');
        if (deh) deh.innerText = extra.toFixed(1);
        if (otSlider) {
            otSlider.max = extra;
            if (!skipSliderReset) {
                if (otSlider.dataset.savedDt !== undefined) { otSlider.value = otSlider.dataset.savedDt; otSlider.setAttribute('data-user-modified', 'true'); delete otSlider.dataset.savedDt; }
                else if (!otSlider.hasAttribute('data-user-modified')) otSlider.value = (selectedType === 'DropPaid') ? 0 : extra;
                else if (parseFloat(otSlider.value) > extra) otSlider.value = extra;
            }
            const dt = parseFloat(otSlider.value) || 0;
            const lso = document.getElementById('lbl-slider-ot');
            const lsd = document.getElementById('lbl-slider-dt');
            if (lso) lso.innerText = Math.max(0, extra - dt).toFixed(1) + 'h';
            if (lsd) lsd.innerText = dt.toFixed(1) + 'h';
        }
    } else {
        if (otS) otS.style.display = 'none';
        if (!skipSliderReset && otSlider) otSlider.removeAttribute('data-user-modified');
    }

    // 120h projection check
    if (f && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        const crewSelect = document.getElementById('crew-select');
        const viewC      = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        const ppStart    = basePPStartUTC + f.ppIndex * MS_PP;
        let proj = 0;
        for (let d = 0; d <= 13; d++) {
            const dS = toDateKey(ppStart + d * MS_DAY);
            proj += (dS === activeDate) ? dur : (dayFatigue[dS]?.scheduledWorkHours || 0);
        }
        if (proj > 120.05) {
            if (wT)  wT.innerHTML    += `🚨 120H LIMIT: Projected ${proj.toFixed(1)}h.<br>`;
            if (ovL) ovL.style.display = 'flex';
            if (!cbOv || !cbOv.checked) canS = false;
        }
    }

    const cw = document.getElementById('conflict-warning');
    if (cw) cw.style.display = (wT && wT.innerHTML) ? 'block' : 'none';
    if (bSave) { bSave.disabled = !canS; bSave.style.opacity = canS ? '1' : '0.5'; bSave.style.pointerEvents = canS ? 'auto' : 'none'; }
}

// ─── Save / Remove shift ──────────────────────────────────────────────────────

function saveShift() {
    haptic();
    const payload = { role: selectedRole };

    if (selectedRole === 'Manual') {
        const manualInput = document.getElementById('manual-rate-input');
        const mRate = manualInput ? parseFloat(manualInput.value) : 0;
        if (mRate > 0) payload.manualRate = mRate;
    }

    const stInput = document.getElementById('input-start-time');
    const etInput = document.getElementById('input-end-time');
    const st = stInput ? stInput.value : '';
    const et = etInput ? etInput.value : '';

    if (st && et) { payload.startTime = st; payload.endTime = et; }
    if (selectedType) payload.type = selectedType;

    const cbOv  = document.getElementById('cb-override');
    let base     = dayFatigue[activeDate] ? dayFatigue[activeDate].baseWorkHours : 0;
    if (dayFatigue[activeDate] && dayFatigue[activeDate].isLockout && cbOv && cbOv.checked) {
        base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    }
    if (['DropPaid', 'DropOff', 'Lieu'].includes(selectedType)) base = 0;

    let dur   = (st && et) ? getDuration(st, et) : 0;
    if (selectedType === 'DropPaid' && dur === 0) dur = 12;

    const extra = Math.max(0, dur - base);
    const short = Math.max(0, base - dur);

    if (selectedType === 'Vacation') {
        payload.vacHours = (dur === 0) ? (base === 0 ? 12 : base) : short;
    } else {
        if (short > 0.05 && selectedType !== 'DropPaid' && selectedType !== 'Lieu') {
            const shortSlider = document.getElementById('short-slider');
            const vH          = shortSlider ? (parseFloat(shortSlider.value) || 0) : 0;
            if (vH > 0) payload.vacHours = vH;
        }
        if (!['Off', 'DropOff', 'Lieu'].includes(selectedType)) {
            const otSlider = document.getElementById('ot-slider');
            const dtH      = otSlider ? (parseFloat(otSlider.value) || 0) : 0;
            const otH      = Math.max(0, extra - dtH);
            if (extra > 0.05) {
                payload.otHours = otH;
                payload.dtHours = dtH;
                const rInput = document.getElementById('input-ot-reason');
                if (rInput && rInput.value.trim()) payload.otReason = rInput.value.trim();
            }
            if (selectedCrew) payload.crew = selectedCrew;
        }
    }
    if (cbOv && cbOv.checked) payload.overrideLockout = true;

    extraShifts[activeDate] = payload;
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
    updateNotifications();
    closeAllSheets();
    showToast('Shift Saved');
}

function removeShift() {
    haptic();
    delete extraShifts[activeDate];
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
    updateNotifications();
    closeAllSheets();
    showToast('Shift Removed', 'error');
}

// ─── Biometrics gate ──────────────────────────────────────────────────────────

function triggerBiometricsAndOpenPay(target = null) {
    haptic();
    if (sysSettings.useBiometrics && window.Fingerprint) {
        window.Fingerprint.isAvailable(
            () => window.Fingerprint.show({ title: 'Authentication Required', description: 'Unlock to view financial data' },
                () => openPayrollSheet(target),
                () => showToast('Authentication Failed', 'error')
            ),
            () => { showToast('Biometrics not setup on this device', 'error'); openPayrollSheet(target); }
        );
    } else {
        openPayrollSheet(target);
    }
}

// ─── Payroll dashboard ────────────────────────────────────────────────────────

let chartInstance = null;
let simBaseGross = 0, simTargetYear = 2026, simTargetPP = 0;

function renderChart(reg, ot, dt, vac, lieu, hol) {
    const ctx     = document.getElementById('payChart');
    const wrapper = document.getElementById('chart-wrapper');
    if (!ctx || !window.Chart) { if (wrapper) wrapper.style.display = 'none'; return; }
    wrapper.style.display = 'block';
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Reg', 'OT', 'DT', 'Vac', 'Lieu', 'Hol'],
            datasets: [{ label: 'Hours', data: [reg, ot, dt, vac, lieu, hol],
                backgroundColor: ['#4ba3e3', '#34a853', '#ff6d00', '#00bcd4', '#fbbc04', '#ea4335'], borderRadius: 6 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.2)' }, ticks: { color: 'rgba(128,128,128,0.8)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(128,128,128,0.8)' } }
            }
        }
    });
}

function runSimulator() {
    const otSlider = document.getElementById('sim-ot-slider');
    const dtSlider = document.getElementById('sim-dt-slider');
    if (!otSlider || !dtSlider) return;

    const otHrs = parseFloat(otSlider.value) || 0;
    const dtHrs = parseFloat(dtSlider.value) || 0;
    document.getElementById('sim-ot-val').innerText = otHrs.toFixed(1) + ' hrs';
    document.getElementById('sim-dt-val').innerText = dtHrs.toFixed(1) + ' hrs';

    const rate       = sysSettings.regRate;
    const extraGross = (otHrs * rate * 1.5) + (dtHrs * rate * 2.0);

    if (extraGross === 0) {
        document.getElementById('sim-gross').innerText = '+$0.00';
        document.getElementById('sim-tax').innerText   = '-$0.00';
        document.getElementById('sim-net').innerText   = '+$0.00';
        return;
    }

    const baseTaxes = calculateTaxes(simBaseGross,              simTargetPP, simTargetYear);
    const newTaxes  = calculateTaxes(simBaseGross + extraGross, simTargetPP, simTargetYear);
    const marginalTax = newTaxes.total - baseTaxes.total;
    document.getElementById('sim-gross').innerText = '+$' + extraGross.toFixed(2);
    document.getElementById('sim-tax').innerText   = '-$' + marginalTax.toFixed(2);
    document.getElementById('sim-net').innerText   = '+$' + (extraGross - marginalTax).toFixed(2);
}

function openPayrollSheet(target = null) {
    const crewSelect = document.getElementById('crew-select');
    const crew       = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
    const cont       = document.getElementById('payroll-content');
    if (!cont) return;

    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    if (target === null) target = Math.floor((nowUTC - basePPStartUTC) / MS_PP);

    const ppS        = basePPStartUTC + target * MS_PP;
    const ppE        = ppS + MS_PP_TO_END;
    const targetYear = new Date(ppE).getUTCFullYear();

    precalcFatigue(targetYear, crew);

    let regH = 0, vacH = 0, ot = 0, dt = 0, gross = 0;
    let aftH = 0, nightH = 0, satH = 0, sunH = 0;
    let statOffH = 0, statWorked15H = 0, statWorked20H = 0, ppLieuTakenH = 0;

    // Find first PP of targetYear for YTD calculations
    let firstPP = 0;
    for (let i = target; i >= 0; i--) {
        const testE = basePPStartUTC + (i * 14 + 13) * MS_DAY;
        if (new Date(testE).getUTCFullYear() < targetYear) { firstPP = i + 1; break; }
        if (i === 0) firstPP = 0;
    }

    let ytdReg = 0, ytdOT = 0, ytdDT = 0, ytdVac = 0, ytdUnpaid = 0, ytdDropOff = 0;

    for (let i = firstPP; i <= target; i++) {
        const s = basePPStartUTC + i * MS_PP;
        for (let d = 0; d <= 13; d++) {
            const u    = s + d * MS_DAY;
            const dS   = toDateKey(u);
            const bS   = getShiftForCrew(getPIndex(u), crew);
            const ex   = extraShifts[dS];
            const f    = dayFatigue[dS] || {};
            const bH   = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);

            let act = bH, isVac = false;
            if (ex) {
                if      (ex.type === 'DropOff')  { act = 0; ytdDropOff += 12; }
                else if (ex.type === 'DropPaid')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; }
                else if (ex.type === 'Vacation')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; }
                else if (ex.type === 'Off' || ex.type === 'Lieu') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
                else if (ex.startTime && ex.endTime) { act = getDuration(ex.startTime, ex.endTime); }
                else if (ex.type) { act = 12; }
            }
            if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') act = 0;

            const dayR = Math.min(act, bH);
            const dayE = Math.max(0, act - bH);
            ytdReg += dayR;

            if (isVac) {
                const vacHours = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? Math.max(0, bH - act) : (bH || 12));
                ytdVac += vacHours;
            } else if (act < bH && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') {
                ytdVac    += ex.vacHours || 0;
                ytdUnpaid += Math.max(0, bH - act - (ex.vacHours || 0));
            } else if (ex?.type === 'Off') {
                ytdUnpaid += (ex.startTime && ex.endTime) ? Math.max(0, bH - act) : (bH || 12);
            }

            if (!f.isLockout && act > 0 && dayE > 0) {
                let sO = ex?.otHours || 0, sD = ex?.dtHours || 0;
                if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                ytdOT += sO; ytdDT += sD;
            }
        }
    }

    const ppEDate = new Date(ppE);
    const ppEStr  = toDateKey(ppE);

    const totalCycleVac  = getUsedVacationHours(crew, ppEStr);
    const vacRem         = Math.max(0, sysSettings.vacationLimit - totalCycleVac);
    const currentCycle   = getVacationCycle(ppEStr);
    const lieuAvailable  = computeLieuBalance(ppEStr, crew, null);
    const cachedHols     = {};

    for (let d = 0; d <= 13; d++) {
        const u    = ppS + d * MS_DAY;
        const dS   = toDateKey(u);
        const bS   = getShiftForCrew(getPIndex(u), crew);
        const ex   = extraShifts[dS];
        const f    = dayFatigue[dS] || {};
        const bH   = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);
        const st   = ex?.startTime || ((bS === 'D' || ex?.type === 'Day') ? '06:30' : '18:30');
        let act = bH, isVac = false, isLieu = false;

        if (ex) {
            if      (ex.type === 'DropOff')  { act = 0; }
            else if (ex.type === 'DropPaid')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; }
            else if (ex.type === 'Vacation')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; }
            else if (ex.type === 'Off')       { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
            else if (ex.type === 'Lieu')      { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isLieu = true; }
            else if (ex.startTime && ex.endTime) { act = getDuration(ex.startTime, ex.endTime); }
            else if (ex.type) { act = 12; }
        }
        if (f.isLockout && !isVac && !isLieu && ex?.type !== 'Off' && ex?.type !== 'DropOff') act = 0;

        const dayR = Math.min(act, bH);
        const dayE = Math.max(0, act - bH);

        let rate = sysSettings.regRate;
        if (ex?.role === 'TL') rate = sysSettings.tlRate;
        else if (ex?.role === 'Manual' && ex?.manualRate) rate = ex.manualRate;

        regH += dayR;

        if (isVac) {
            const vacHours = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? Math.max(0, bH - act) : (bH || 12));
            vacH  += vacHours;
            gross += vacHours * rate;
        } else if (isLieu) {
            const lH = (!ex.startTime && !ex.endTime) ? (bH || 12) : Math.max(0, bH - act);
            ppLieuTakenH += lH;
        } else if (act < bH && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') {
            const vH = ex.vacHours || 0;
            vacH  += vH;
            gross += vH * rate;
        }

        if (!f.isLockout && act > 0) {
            const pD = calcPremiums(dS, st, dayR, rate);
            gross += (dayR * rate) + pD.total;
            aftH += pD.aftHrs; nightH += pD.nightHrs; satH += pD.satHrs; sunH += pD.sunHrs;
            if (dayE > 0) {
                let sO = ex?.otHours || 0, sD = ex?.dtHours || 0;
                if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                gross += (sO * rate * 1.5) + (sD * rate * 2.0);
                ot += sO; dt += sD;
            }
        }

        const holYear = parseInt(dS.substring(0, 4));
        if (!cachedHols[holYear]) cachedHols[holYear] = getHolidays(holYear);
        const holInfo = cachedHols[holYear][dS];
        if (holInfo) {
            if (bH === 0 && !['Vacation', 'DropOff', 'Lieu', 'Off'].includes(ex?.type)) { statOffH += 8; gross += 8 * rate; }
            if (dayR > 0) {
                let shiftType = ex?.type || (bS === 'D' ? 'Day' : (bS === 'N' ? 'Night' : null));
                if (!shiftType && ex?.startTime) { const sHr = parseInt(ex.startTime.split(':')[0]); shiftType = (sHr >= 6 && sHr < 18) ? 'Day' : 'Night'; }
                if (!shiftType) shiftType = 'Day';
                const holPremH = (shiftType === 'Day' || shiftType === 'D') ? dayR : Math.min(dayR, 8);
                if (holInfo.m === 2.0) { statWorked20H += holPremH; gross += holPremH * rate * 1.0; }
                else                  { statWorked15H += holPremH; gross += holPremH * rate * 0.5; }
            }
        }
    }

    const t = calculateTaxes(gross, target, targetYear);
    simBaseGross  = gross;
    simTargetYear = targetYear;
    simTargetPP   = target;
    const otS2 = document.getElementById('sim-ot-slider');
    const dtS2 = document.getElementById('sim-dt-slider');
    if (otS2) otS2.value = 0;
    if (dtS2) dtS2.value = 0;
    runSimulator();

    renderChart(regH, ot, dt, vacH, ppLieuTakenH, statOffH + statWorked15H + statWorked20H);

    const vacHtml    = vacH > 0         ? `<div class="pp-stat-row"><span>Vacation:</span> <strong style="color: #00bcd4;">${vacH.toFixed(1)} hrs</strong></div>` : '';
    const lieuHtml   = ppLieuTakenH > 0 ? `<div class="pp-stat-row"><span>Lieu Day (Unpaid):</span> <strong style="color: #fbbc04;">${ppLieuTakenH.toFixed(1)} hrs</strong></div>` : '';
    const statOffHtml  = statOffH > 0      ? `<div class="pp-stat-row"><span>Holiday Pay (Unworked):</span> <strong style="color: #fbbc04;">${statOffH.toFixed(1)} hrs</strong></div>` : '';
    const stat15Html   = statWorked15H > 0 ? `<div class="pp-stat-row"><span>Working Holiday (1.5x):</span> <strong style="color: #ff6d00;">${statWorked15H.toFixed(1)} hrs</strong></div>` : '';
    const stat20Html   = statWorked20H > 0 ? `<div class="pp-stat-row"><span>Christmas Holiday (2.0x):</span> <strong style="color: var(--night);">${statWorked20H.toFixed(1)} hrs</strong></div>` : '';
    const lieuBankHtml = `<div class="pp-stat-row" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);"><span>Banked Lieu Days:</span> <strong style="color:#fbbc04;">${lieuAvailable} Avail</strong></div>`;

    cont.innerHTML = `
        <div class="pp-card active-pp" id="printable-paystub">
            <div class="pp-header"><span>${new Date(ppS).toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${new Date(ppE).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
            <div class="pp-stats">
                <div class="pp-stat-row"><span>Regular:</span> <strong>${regH.toFixed(1)} hrs</strong></div>
                ${vacHtml}${lieuHtml}${statOffHtml}${stat15Html}${stat20Html}${lieuBankHtml}
                <div class="pp-stat-row" style="margin-top:8px;"><span>OT (1.5x):</span> <strong style="color:#34a853;">${ot.toFixed(1)} hrs</strong></div>
                <div class="pp-stat-row"><span>DT (2.0x):</span> <strong style="color:#4285f4;">${dt.toFixed(1)} hrs</strong></div>
                <div class="pp-stat-row pp-total"><span>TOTAL:</span> <span>${(regH + vacH + ot + dt + statOffH).toFixed(1)} hrs</span></div>
            </div>
            <div class="pp-financials" style="margin-bottom:15px;border-color:var(--border);">
                <div class="fin-section-title" style="margin-top:0;color:var(--text-muted);">${targetYear} YTD Worked Hours</div>
                <div class="fin-row"><span>Regular:</span> <span style="font-weight:bold;color:var(--text);">${ytdReg.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Overtime (1.5x):</span> <span style="color:#34a853;font-weight:bold;">${ytdOT.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Double Time (2.0x):</span> <span style="color:#4285f4;font-weight:bold;">${ytdDT.toFixed(1)} hrs</span></div>
                <div class="fin-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;"><span>Total Worked YTD:</span> <span style="color:var(--text);font-weight:bold;">${(ytdReg + ytdOT + ytdDT).toFixed(1)} hrs</span></div>
                <div class="fin-section-title" style="margin-top:15px;color:var(--text-muted);">Cycle Absences (${currentCycle.start} to ${currentCycle.end})</div>
                <div class="fin-row"><span>Remaining Vacation:</span> <span style="color:#00bcd4;font-weight:bold;">${vacRem.toFixed(1)} / ${sysSettings.vacationLimit} hrs</span></div>
                <div class="fin-row"><span>Unpaid Absences:</span> <span style="color:var(--night);font-weight:bold;">${ytdUnpaid.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Drop Days (Off):</span> <span style="color:var(--day);font-weight:bold;">${(ytdDropOff / 12).toFixed(0)} shifts (${ytdDropOff.toFixed(1)} hrs)</span></div>
            </div>
            <div class="pp-financials">
                <div class="fin-section-title" style="margin-top:0;">Premium Hours</div>
                <div class="fin-row"><span>Aft/Night:</span> <span>${(aftH + nightH).toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Sat/Sun:</span> <span>${(satH + sunH).toFixed(1)} hrs</span></div>
                <div class="fin-section-title deduct">Deductions</div>
                <div class="fin-row"><span>Tax (Fed+ON):</span> <span>-$${(t.fedTax + t.onTax).toFixed(2)}</span></div>
                <div class="fin-row"><span>CPP / EI:</span> <span>-$${(t.cpp + t.ei).toFixed(2)}</span></div>
                <div class="fin-row" style="margin-top:15px;padding-top:12px;border-top:1px dashed var(--border);font-weight:bold;color:var(--text);"><span>Gross:</span> <span>$${gross.toFixed(2)}</span></div>
                <div class="fin-row net"><span>Net Pay:</span> <span>$${(gross - t.total).toFixed(2)}</span></div>
            </div>
        </div>`;
    openSheet('sheet-payroll');
}

// ─── Settings sheet ───────────────────────────────────────────────────────────

function openSettingsSheet() {
    haptic();
    const yearSelect = document.getElementById('year-select');
    const year       = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const cppS       = document.getElementById('cpp-max-pp');
    const eiS        = document.getElementById('ei-max-pp');
    let opts = `<option value="9999">Not Met Yet</option>`;
    for (let i = 0; i < 300; i++) {
        const ppE = new Date(basePPStartUTC + (i * 14 + 13) * MS_DAY);
        if (ppE.getUTCFullYear() === year) opts += `<option value="${i}">Ending ${ppE.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</option>`;
    }
    if (cppS) cppS.innerHTML = opts;
    if (eiS)  eiS.innerHTML  = opts;

    const fields = {
        'setting-theme':        { el: null, key: 'theme' },
        'setting-display-name': { el: null, key: 'displayName' },
        'setting-reg-rate':     { el: null, key: 'regRate', fmt: v => v.toFixed(2) },
        'setting-tl-rate':      { el: null, key: 'tlRate',  fmt: v => v.toFixed(2) },
        'setting-default-role': { el: null, key: 'defaultRole' },
        'setting-vacation-limit':{ el: null, key: 'vacationLimit' },
        'setting-vac-start':    { el: null, key: 'vacationStartDate' },
        'setting-vac-end':      { el: null, key: 'vacationEndDate' },
        'setting-default-crew': { el: null, key: 'defaultCrew' },
        'setting-start-year':   { el: null, key: 'startYear' },
        'setting-end-year':     { el: null, key: 'endYear' }
    };
    for (const [id, cfg] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = cfg.fmt ? cfg.fmt(sysSettings[cfg.key]) : sysSettings[cfg.key];
    }

    const checkboxes = {
        'setting-notif-24':  'notif24h',
        'setting-notif-12':  'notif12h',
        'setting-notif-3':   'notif3h',
        'setting-biometrics':'useBiometrics',
        'setting-cal-sync':  'syncCalendar',
        'setting-alarms':    'smartAlarms'
    };
    for (const [id, key] of Object.entries(checkboxes)) {
        const el = document.getElementById(id);
        if (el) el.checked = sysSettings[key];
    }

    const rotInput = document.getElementById('rot-date-input');
    if (rotInput) rotInput.value = savedRot.date;

    selectedRotOffset = savedRot.offset;
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => {
        b.classList.remove('active');
        if (b.id === 'btn-rot-' + selectedRotOffset) b.classList.add('active');
    });

    if (cppS) cppS.value = sysSettings.cppMaxPP;
    if (eiS)  eiS.value  = sysSettings.eiMaxPP;

    openSheet('sheet-settings');
}

function saveSettings() {
    haptic();
    const g = id => document.getElementById(id);
    sysSettings = {
        theme:             g('setting-theme')         ? g('setting-theme').value           : 'system',
        displayName:       g('setting-display-name')  ? (g('setting-display-name').value || 'Drizzy') : 'Drizzy',
        regRate:           g('setting-reg-rate')       ? (parseFloat(g('setting-reg-rate').value) || 47.06)  : 47.06,
        tlRate:            g('setting-tl-rate')        ? (parseFloat(g('setting-tl-rate').value) || 50.11)  : 50.11,
        defaultRole:       g('setting-default-role')   ? (g('setting-default-role').value || 'Reg') : 'Reg',
        vacationLimit:     g('setting-vacation-limit') ? (parseFloat(g('setting-vacation-limit').value) || 150) : 150,
        vacationStartDate: g('setting-vac-start') && g('setting-vac-start').value ? g('setting-vac-start').value : '2026-01-01',
        vacationEndDate:   g('setting-vac-end')   && g('setting-vac-end').value   ? g('setting-vac-end').value   : '2027-01-15',
        cppMaxPP:          g('cpp-max-pp') ? parseInt(g('cpp-max-pp').value) : 9999,
        eiMaxPP:           g('ei-max-pp')  ? parseInt(g('ei-max-pp').value)  : 9999,
        defaultCrew:       g('setting-default-crew')   ? g('setting-default-crew').value : 'D',
        startYear:         g('setting-start-year') ? (parseInt(g('setting-start-year').value) || 2024) : 2024,
        endYear:           g('setting-end-year')   ? (parseInt(g('setting-end-year').value)   || 2036) : 2036,
        notif24h:          g('setting-notif-24')    ? g('setting-notif-24').checked    : true,
        notif12h:          g('setting-notif-12')    ? g('setting-notif-12').checked    : true,
        notif3h:           g('setting-notif-3')     ? g('setting-notif-3').checked     : true,
        useBiometrics:     g('setting-biometrics')  ? g('setting-biometrics').checked  : false,
        syncCalendar:      g('setting-cal-sync')    ? g('setting-cal-sync').checked    : false,
        smartAlarms:       g('setting-alarms')      ? g('setting-alarms').checked      : false
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings));

    const gText = document.getElementById('greeting-text');
    if (gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;

    const rotInput = document.getElementById('rot-date-input');
    if (rotInput && rotInput.value && selectedRotOffset !== null) {
        savedRot = { date: rotInput.value, offset: selectedRotOffset };
        localStorage.setItem(STORAGE_KEYS.ROTATION, JSON.stringify(savedRot));
    }
    populateYearSelect();
    renderCalendar();
    closeAllSheets();
    updateNotifications();
    showToast('Settings Saved');
}

function selectRotOffset(o) {
    haptic();
    selectedRotOffset = o;
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('btn-rot-' + o);
    if (btn) btn.classList.add('active');
}

// ─── Cordova / browser event wiring ──────────────────────────────────────────

document.addEventListener('deviceready', function() {
    document.addEventListener('backbutton', function(e) {
        const activeEl       = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isInputFocused) { activeEl.blur(); return; }
        if (document.querySelector('.bottom-sheet.active')) closeAllSheets();
        else navigator.app.exitApp();
    }, false);

    if (window.cordova && cordova.plugins && cordova.plugins.notification && cordova.plugins.notification.local) {
        cordova.plugins.notification.local.hasPermission(granted => {
            if (!granted) {
                cordova.plugins.notification.local.requestPermission(g => { if (g) updateNotifications(); });
            } else {
                updateNotifications();
            }
        });
    }
}, false);

window.addEventListener('popstate', () => {
    const activeEl       = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    if (isInputFocused) { activeEl.blur(); history.pushState({ sheetOpen: true }, ''); return; }
    if (document.querySelector('.bottom-sheet.active')) closeAllSheets(true);
});

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker registration failed:', err));
    });
}

// ─── Initial page setup ───────────────────────────────────────────────────────

const gText = document.getElementById('greeting-text');
if (gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;
populateYearSelect();

const cSel = document.getElementById('crew-select');
if (cSel) cSel.value = sysSettings.defaultCrew;
renderCalendar();
