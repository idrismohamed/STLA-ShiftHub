// ─── Shift form state ─────────────────────────────────────────────────────────

let activeDate = null, activeCurrentShift = null, activeNextShift = null;
let selectedType = null, selectedCrew = null, selectedRole = sysSettings.defaultRole;
let selectedRegPay = false;
let _pendingOverridePayload = {};

const _sheetHolCache = {};

// ─── Shift form helpers ───────────────────────────────────────────────────────

function clearTimes() {
    haptic();
    const sInput = document.getElementById('input-start-time');
    const eInput = document.getElementById('input-end-time');
    const rInput = document.getElementById('input-ot-reason');
    if (sInput) sInput.value = '';
    if (eInput) eInput.value = '';
    if (rInput) rInput.value = '';
    selectedRegPay = false;
    clearShift2();
    resetSliders();
    updatePickupToggles();
}

function addShift2() {
    haptic();
    const sec = document.getElementById('section-shift2');
    const btn = document.getElementById('btn-add-shift2');
    if (sec) sec.style.display = 'block';
    if (btn) btn.style.display = 'none';
}

function clearShift2() {
    haptic();
    const s2 = document.getElementById('input-start-time-2');
    const e2 = document.getElementById('input-end-time-2');
    if (s2) s2.value = '';
    if (e2) e2.value = '';
    const sec = document.getElementById('section-shift2');
    if (sec) sec.style.display = 'none';
    updatePickupToggles();
}

function updateShift2SliderLabels() {
    const slider = document.getElementById('shift2-ot-slider');
    if (!slider) return;
    slider.setAttribute('data-user-modified', 'true');
    const dt    = parseFloat(slider.value) || 0;
    const total = parseFloat(slider.max)   || 0;
    const otLbl = document.getElementById('lbl-shift2-ot');
    const dtLbl = document.getElementById('lbl-shift2-dt');
    if (otLbl) otLbl.innerText = Math.max(0, total - dt).toFixed(1) + 'h';
    if (dtLbl) dtLbl.innerText = dt.toFixed(1) + 'h';
}

function toggleRegPay() {
    haptic();
    selectedRegPay = !selectedRegPay;
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
    if (sheetDate) sheetDate.textContent = disp;

    const yr = parseInt(dStr.substring(0, 4));
    if (!_sheetHolCache[yr]) _sheetHolCache[yr] = getHolidays(yr);
    const holInfo = _sheetHolCache[yr][dStr];
    const holBanner = document.getElementById('sheet-holiday-banner');
    const holName   = document.getElementById('sheet-holiday-name');
    if (holBanner && holName) {
        holName.textContent = holInfo ? '⭐ ' + holInfo.n : '';
        holBanner.classList.toggle('visible', !!holInfo);
    }

    const ex         = extraShifts[dStr] || {};
    const targetType = ex.type || curS;
    let defS = '', defE = '';

    if      (targetType === 'Day'  || targetType === 'D') { defS = '06:30'; defE = '18:30'; }
    else if (targetType === 'Night'|| targetType === 'N') { defS = '18:30'; defE = '06:30'; }
    else if (targetType === 'DropPaid') { defS = (curS === 'N') ? '18:30' : '06:30'; defE = (curS === 'N') ? '06:30' : '18:30'; }

    if (['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(targetType) || (targetType === 'O' && selectedType !== 'DropPaid')) {
        defS = ''; defE = '';
    }

    const regRoleBtn = document.getElementById('btn-role-Reg');
    const tlRoleBtn  = document.getElementById('btn-role-TL');
    if (regRoleBtn) regRoleBtn.innerText = `Regular ($${sysSettings.regRate.toFixed(2)})`;
    if (tlRoleBtn)  tlRoleBtn.innerText  = `Team Leader ($${sysSettings.tlRate.toFixed(2)})`;

    selectedType = ex.type || null;
    selectedCrew = normalizeCrew(ex.crew) || null;
    selectedRole = ex.role || sysSettings.defaultRole || 'Reg';
    selectedRegPay = ex.regPay || false;

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

    // Restore 2nd shift state
    const s2Sec = document.getElementById('section-shift2');
    const s2Btn = document.getElementById('btn-add-shift2');
    const s2St  = document.getElementById('input-start-time-2');
    const s2Et  = document.getElementById('input-end-time-2');
    const s2Slider = document.getElementById('shift2-ot-slider');
    if (ex.shift2 && ex.shift2.startTime) {
        if (s2Sec) s2Sec.style.display = 'block';
        if (s2Btn) s2Btn.style.display = 'none';
        if (s2St)  s2St.value  = ex.shift2.startTime || '';
        if (s2Et)  s2Et.value  = ex.shift2.endTime   || '';
        if (s2Slider) {
            s2Slider.removeAttribute('data-user-modified');
            if (ex.shift2.dtHours !== undefined) s2Slider.dataset.savedDt = ex.shift2.dtHours;
            else delete s2Slider.dataset.savedDt;
        }
    } else {
        if (s2Sec) s2Sec.style.display = 'none';
        if (s2St)  s2St.value  = '';
        if (s2Et)  s2Et.value  = '';
        if (s2Slider) { s2Slider.removeAttribute('data-user-modified'); delete s2Slider.dataset.savedDt; }
    }

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

    if (['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) selectedType = null;
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
    else if (['DropOff', 'Vacation', 'Off', 'Lieu', 'OffDay'].includes(selectedType)) {
        if (stInput) stInput.value = '';
        if (etInput) etInput.value = '';
        const rInput = document.getElementById('input-ot-reason');
        if (rInput) rInput.value = '';
        selectedCrew = null;
    } else if (selectedType === 'DropPaid') {
        if (activeCurrentShift === 'N') { if (stInput) stInput.value = '18:30'; if (etInput) etInput.value = '06:30'; }
        else                            { if (stInput) stInput.value = '06:30'; if (etInput) etInput.value = '18:30'; }
        selectedRegPay = false;
    } else {
        selectedRegPay = false;
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
    _pendingOverridePayload = {};

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

    const btnDropPaid      = document.getElementById('btn-type-DropPaid');
    const btnDropOff       = document.getElementById('btn-type-DropOff');
    const dropPaidOverride = document.getElementById('drop-paid-override-wrap');
    // Time Off group is always the parent of btnDropOff (it never moves)
    const timeOffGroup     = btnDropOff && btnDropOff.parentNode;
    if (btnDropPaid && dropPaidOverride && timeOffGroup) {
        if (isDropPeriod) {
            const overrideGroup = dropPaidOverride.querySelector('.toggle-group');
            if (overrideGroup && btnDropPaid.parentNode !== overrideGroup) {
                overrideGroup.appendChild(btnDropPaid);
            }
            btnDropPaid.style.flexBasis = '100%';
            btnDropPaid.style.display   = 'block';
            dropPaidOverride.style.display = 'block';
        } else {
            if (btnDropPaid.parentNode !== timeOffGroup) {
                timeOffGroup.appendChild(btnDropPaid);
            }
            dropPaidOverride.style.display = 'none';
            btnDropPaid.style.display      = 'none';
        }
    }
    if (btnDropOff) btnDropOff.style.display = 'block';

    if (selectedType && ['Day', 'Night', 'OffDay'].includes(selectedType)) {
        const btn = document.getElementById('btn-type-' + selectedType);
        if (btn) btn.classList.add('active');
    }
    if (selectedCrew) {
        const btn = document.getElementById('btn-crew-' + selectedCrew);
        if (btn) btn.classList.add('active');
    }
    const activeRoleBtn = document.getElementById('btn-role-' + selectedRole);
    if (activeRoleBtn) activeRoleBtn.classList.add('active');

    const isTimeOff            = ['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType);
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

    const cbOv = document.getElementById('cb-override');

    // ── Rule 1: 16h/24h window — Rule 2: 8h rest only when Rule 1 fires ───────
    if (selectedType && !['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
        const crewSel2  = document.getElementById('crew-select');
        const viewCrew2 = crewSel2 ? crewSel2.value : sysSettings.defaultCrew;
        const stIn2 = document.getElementById('input-start-time');
        const etIn2 = document.getElementById('input-end-time');
        const st2   = stIn2 ? stIn2.value : '';
        const et2   = etIn2 ? etIn2.value : '';
        const exCur = extraShifts[activeDate];

        let propStart, propEnd;
        if (st2 && et2) {
            propStart = getFloatTime(st2);
            propEnd   = getFloatTime(et2); if (propEnd < propStart) propEnd += 24;
        } else if (selectedType === 'Day')   { propStart = 6.5;  propEnd = 18.5; }
        else if (selectedType === 'Night')   { propStart = 18.5; propEnd = 30.5; }

        if (propStart !== undefined) {
            const prevUTC   = Date.UTC(+activeDate.substring(0,4), +activeDate.substring(5,7)-1, +activeDate.substring(8,10)) - MS_DAY;
            const prevStr   = toDateKey(prevUTC);
            const prevStart = getShiftStartFloat(prevStr, viewCrew2);
            const prevEnd   = getShiftEndFloat(prevStr, viewCrew2);

            if (prevStart !== null && prevEnd !== null) {
                const propStartAbs  = propStart + 24;
                const propEndAbs    = propEnd   + 24;
                const windowEnd     = prevStart  + 24;
                const overlap       = Math.max(0, Math.min(propEndAbs, windowEnd) - Math.max(propStartAbs, prevStart));
                const totalInWindow = (prevEnd - prevStart) + overlap;
                const windowUsed    = prevEnd - prevStart;

                if (totalInWindow > 16.01) {
                    if (!(exCur && exCur.overrideRule16h)) {
                        const hoursLeft = Math.max(0, 16 - windowUsed).toFixed(1);
                        if (wT) wT.innerHTML += `🚨 16H LIMIT: ${totalInWindow.toFixed(1)}h in 24h window (max 16h — ${hoursLeft}h remaining).<br>`;
                        if (ovL) ovL.style.display = 'flex';
                        _pendingOverridePayload.overrideRule16h = true;
                        if (!cbOv || !cbOv.checked) canS = false;
                    }
                    // Rule 2 — only when Rule 1 fires
                    const rest = propStartAbs - prevEnd;
                    if (rest < 8 && !(exCur && exCur.overrideRest)) {
                        if (wT) wT.innerHTML += `🚨 INSUFFICIENT REST: Only ${Math.max(0, rest).toFixed(1)}h rest (min 8h when at 16h cap).<br>`;
                        if (ovL) ovL.style.display = 'flex';
                        _pendingOverridePayload.overrideRest = true;
                        if (!cbOv || !cbOv.checked) canS = false;
                    }
                }
            }
        }
    }

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

    // Rest-time checks (custom times — general adjacency check independent of Rule 1)
    if (st && et && !['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
        let currentStart = getFloatTime(st);
        let currentEnd   = getFloatTime(et); if (currentEnd < currentStart) currentEnd += 24;
        const dateObj    = new Date(activeDate + 'T00:00:00Z');
        const crewSelect = document.getElementById('crew-select');
        const crew       = crewSelect ? crewSelect.value : sysSettings.defaultCrew;

        const yUTC = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate() - 1);
        const yStr = toDateKey(yUTC);
        const yEnd = getShiftEndFloat(yStr, crew);
        if (yEnd !== null) {
            const restBack = (currentStart + 24) - yEnd;
            if (restBack < 7.95) {
                if (wT)  wT.innerHTML    += `🚨 INSUFFICIENT REST: Only ${restBack.toFixed(1)}h rest since yesterday's shift.<br>`;
                if (ovL) ovL.style.display = 'flex';
                _pendingOverridePayload.overrideRest = true;
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
                _pendingOverridePayload.overrideRest = true;
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
    if (f && f.isLockout && cbOv && cbOv.checked) base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    if (['DropPaid', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) base = 0;

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

    if (extra > 0.05 && !['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
        if (otS) otS.style.display = 'block';
        const deh = document.getElementById('display-extra-hours');
        if (deh) deh.innerText = extra.toFixed(1);

        // Show "Regular Pay" button only for off-day pickups (base = 0)
        const regPayBtn  = document.getElementById('btn-reg-pay');
        const otDtSection = document.getElementById('ot-dt-section');
        const isOffDay = (base === 0 && !['DropPaid'].includes(selectedType));
        if (regPayBtn) {
            regPayBtn.style.display = isOffDay ? 'block' : 'none';
            regPayBtn.style.background = selectedRegPay ? 'rgba(75,163,227,0.15)' : 'var(--input-bg)';
            regPayBtn.style.borderColor = selectedRegPay ? 'var(--accent)' : 'var(--border)';
            regPayBtn.style.color = selectedRegPay ? 'var(--accent)' : 'var(--text-muted)';
        }
        if (otDtSection) otDtSection.style.display = (isOffDay && selectedRegPay) ? 'none' : 'block';

        if (!selectedRegPay) {
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
        }
    } else {
        if (otS) otS.style.display = 'none';
        if (!skipSliderReset && otSlider) otSlider.removeAttribute('data-user-modified');
        const regPayBtn = document.getElementById('btn-reg-pay');
        if (regPayBtn) regPayBtn.style.display = 'none';
        const otDtSection = document.getElementById('ot-dt-section');
        if (otDtSection) otDtSection.style.display = 'block';
    }

    // 120h projection check
    if (f && !['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
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
            _pendingOverridePayload.overrideLockout = true;
            if (!cbOv || !cbOv.checked) canS = false;
        }
    }

    // ── Additional-time section visibility and OT slider ────────────────────
    const _addBtn    = document.getElementById('btn-add-shift2');
    const _shift2Sec = document.getElementById('section-shift2');
    const _shift2Vis = _shift2Sec && _shift2Sec.style.display !== 'none';
    if (_addBtn) _addBtn.style.display = _shift2Vis ? 'none' : 'block';

    const _s2St = document.getElementById('input-start-time-2');
    const _s2Et = document.getElementById('input-end-time-2');
    const _s2St_v = _s2St ? _s2St.value : '';
    const _s2Et_v = _s2Et ? _s2Et.value : '';
    const _s2Sec_ot = document.getElementById('section-shift2-ot');
    const _s2Slider = document.getElementById('shift2-ot-slider');
    if (_s2St_v && _s2Et_v) {
        const _s2dur = getDuration(_s2St_v, _s2Et_v);
        if (_s2Sec_ot) _s2Sec_ot.style.display = _s2dur > 0.05 ? 'block' : 'none';
        const _s2disp = document.getElementById('display-shift2-hours');
        if (_s2disp) _s2disp.textContent = _s2dur.toFixed(1);
        if (_s2Slider) {
            _s2Slider.max = _s2dur;
            if (_s2Slider.dataset.savedDt !== undefined) {
                _s2Slider.value = _s2Slider.dataset.savedDt;
                _s2Slider.setAttribute('data-user-modified', 'true');
                delete _s2Slider.dataset.savedDt;
            } else if (!_s2Slider.hasAttribute('data-user-modified')) {
                _s2Slider.value = 0; // default all OT
            } else if (parseFloat(_s2Slider.value) > _s2dur) {
                _s2Slider.value = _s2dur;
            }
            const _s2dt = parseFloat(_s2Slider.value) || 0;
            const _s2otLbl = document.getElementById('lbl-shift2-ot');
            const _s2dtLbl = document.getElementById('lbl-shift2-dt');
            if (_s2otLbl) _s2otLbl.innerText = Math.max(0, _s2dur - _s2dt).toFixed(1) + 'h';
            if (_s2dtLbl) _s2dtLbl.innerText = _s2dt.toFixed(1) + 'h';
        }
    } else {
        if (_s2Sec_ot) _s2Sec_ot.style.display = 'none';
    }

    // ── Single-day 16h cap: total hours on THIS day (the modified main shift +
    //    any 2nd shift) may not exceed 16h unless the override is checked. Runs
    //    for any working day from the actual times — not only when a shift type
    //    was explicitly tapped (an unmodified scheduled day has selectedType null).
    if (!['Vacation', 'Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
        const _mainH = (st && et) ? dur : 0;
        const _s2H = (_s2St_v && _s2Et_v) ? getDuration(_s2St_v, _s2Et_v) : 0;
        const _dayTotal = _mainH + _s2H;
        const _exCur16 = extraShifts[activeDate];
        if (_dayTotal > 16.01 && !(_exCur16 && _exCur16.overrideRule16h)) {
            if (wT)  wT.innerHTML += `🚨 16H LIMIT: ${_dayTotal.toFixed(1)}h booked on this day (max 16h without override).<br>`;
            if (ovL) ovL.style.display = 'flex';
            _pendingOverridePayload.overrideRule16h = true;
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

    // Fall back to existing saved times if only one field is present (mobile input can
    // temporarily clear a field while the user is editing the other one)
    const existingEx = extraShifts[activeDate] || {};
    const finalSt = st || existingEx.startTime || '';
    const finalEt = et || existingEx.endTime   || '';
    if (finalSt && finalEt) { payload.startTime = finalSt; payload.endTime = finalEt; }
    if (selectedType) payload.type = selectedType;

    const cbOv  = document.getElementById('cb-override');
    let base     = dayFatigue[activeDate] ? dayFatigue[activeDate].baseWorkHours : 0;
    if (dayFatigue[activeDate] && dayFatigue[activeDate].isLockout && cbOv && cbOv.checked) {
        base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    }
    if (['DropPaid', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) base = 0;

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
        if (!['Off', 'DropOff', 'Lieu', 'OffDay'].includes(selectedType)) {
            if (extra > 0.05) {
                if (selectedRegPay && base === 0) {
                    payload.regPay = true;
                } else {
                    const otSlider = document.getElementById('ot-slider');
                    const dtH      = otSlider ? (parseFloat(otSlider.value) || 0) : 0;
                    const otH      = Math.max(0, extra - dtH);
                    payload.otHours = otH;
                    payload.dtHours = dtH;
                }
                const rInput = document.getElementById('input-ot-reason');
                if (rInput && rInput.value.trim()) payload.otReason = rInput.value.trim();
            }
            if (selectedCrew) payload.crew = selectedCrew;
        }
    }
    if (cbOv && cbOv.checked) {
        if (_pendingOverridePayload.overrideLockout) payload.overrideLockout = true;
        if (_pendingOverridePayload.overrideRule16h) payload.overrideRule16h  = true;
        if (_pendingOverridePayload.overrideRest)    payload.overrideRest     = true;
        if (!_pendingOverridePayload.overrideLockout && !_pendingOverridePayload.overrideRule16h && !_pendingOverridePayload.overrideRest) {
            payload.overrideLockout = true;
        }
    }

    // Save 2nd shift if the section is visible and has times
    const _s2Sec2 = document.getElementById('section-shift2');
    if (_s2Sec2 && _s2Sec2.style.display !== 'none') {
        const _s2StV = (document.getElementById('input-start-time-2') || {}).value || '';
        const _s2EtV = (document.getElementById('input-end-time-2')   || {}).value || '';
        if (_s2StV && _s2EtV) {
            const _s2dur2 = getDuration(_s2StV, _s2EtV);
            const _s2sl   = document.getElementById('shift2-ot-slider');
            const _s2dtH  = _s2sl ? (parseFloat(_s2sl.value) || 0) : 0;
            payload.shift2 = {
                startTime: _s2StV,
                endTime:   _s2EtV,
                otHours:   parseFloat(Math.max(0, _s2dur2 - _s2dtH).toFixed(2)),
                dtHours:   parseFloat(_s2dtH.toFixed(2))
            };
        }
    }

    extraShifts[activeDate] = payload;
    try { localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts)); }
    catch(e) { showToast('Storage full — shift not saved.', 'error'); return; }
    invalidateFatigueCache();
    if (typeof dataChanged === 'function') dataChanged();
    updateNotifications();
    closeAllSheets();
    showToast('Shift Saved');
}

function removeShift() {
    haptic();
    if (syncedEvents[activeDate]) {
        delete syncedEvents[activeDate];
        try { localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, JSON.stringify(syncedEvents)); } catch(e) {}
    }
    const _undoDate    = activeDate;
    const _undoPayload = extraShifts[activeDate] ? { ...extraShifts[activeDate] } : null;
    delete extraShifts[activeDate];
    try { localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts)); }
    catch(e) { showToast('Storage full — could not remove shift.', 'error'); return; }
    invalidateFatigueCache();
    if (typeof dataChanged === 'function') dataChanged();
    updateNotifications();
    closeAllSheets();
    if (_undoPayload) showToastWithUndo('Shift Removed', _undoDate, _undoPayload);
    else showToast('Shift Removed', 'error');
}