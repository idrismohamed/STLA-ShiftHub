/** Smooth-scroll the "today" cell into view. */
function scrollToToday() {
    const el = document.querySelector('.day.today');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Rebuild all 12 monthly grids for the currently selected year and crew.
 * Reads year from #year-select, crew from #crew-select, and all state from
 * the global extraShifts / dayFatigue objects.
 */
function renderCalendar() {
    const cal = document.getElementById('calendar');
    if (!cal) return;

    const yearSelect = document.getElementById('year-select');
    const crewSelect = document.getElementById('crew-select');
    const year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;

    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const currentTargetPPIndex = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const todayStr = toDateKey(nowUTC);

    precalcFatigue(year, crew);
    const yearHols = getHolidays(year);
    let fullCalendarHtml = '';

    for (let m = 0; m < 12; m++) {
        const first  = new Date(year, m, 1);
        const last   = new Date(year, m + 1, 0);
        const startD = (first.getDay() + 2) % 7;

        let html = `<div class="month-container"><h2 class="month-title">${months[m]}</h2><div class="grid">`;
        for (const h of daysOfWeek) html += `<div class="day-header">${h}</div>`;
        for (let i = 0; i < startD; i++) html += `<div class="day empty"></div>`;

        for (let d = 1; d <= last.getDate(); d++) {
            const target = Date.UTC(year, m, d);
            const dStr   = toDateKey(target);
            const pI     = getPIndex(target);
            let shift    = getShiftForCrew(pI, crew);
            let sC       = shift;
            let lbl      = shift === 'N' ? 'NIGHT' : (shift === 'D' ? 'DAY' : 'OFF');
            let alt = '', oH = '', tH = '';
            const next   = getShiftForCrew((pI + 1) % 28, crew);

            const f = dayFatigue[dStr] || {};
            if (f.isLockout) { shift = 'O'; sC = 'O'; lbl = 'OFF'; }

            const ex   = extraShifts[dStr];
            const baseH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((shift === 'D' || shift === 'N') ? 12 : 0);
            let eH = '';

            if (ex) {
                // Zero out stale OT/DT if shift duration no longer supports it
                if (ex.otHours > 0 || ex.dtHours > 0) {
                    const actualExtra = Math.max(0, (ex.startTime && ex.endTime ? getDuration(ex.startTime, ex.endTime) : 12) - baseH);
                    if (actualExtra <= 0.05) { ex.otHours = 0; ex.dtHours = 0; }
                }

                if (ex.type === 'Vacation') {
                    if (ex.startTime && ex.endTime) {
                        eH = `<div class="extra-shift" style="background:#00bcd4;color:#fff;">🏖️ Partial Vac</div>`; sC = 'M'; lbl = 'PARTIAL VAC';
                    } else {
                        eH = `<div class="extra-shift" style="background:#00bcd4;color:#fff;">🏖️ Vacation</div>`; sC = 'O'; lbl = 'VACATION';
                    }
                } else if (ex.type === 'Off') {
                    if (ex.startTime && ex.endTime) {
                        eH = `<div class="extra-shift" style="background:var(--night);color:#fff;">🚫 Partial Off</div>`; sC = 'M'; lbl = 'PARTIAL OFF';
                    } else {
                        eH = `<div class="extra-shift" style="background:var(--night);color:#fff;">🚫 Unpaid Off</div>`; sC = 'O'; lbl = 'ABSENT';
                    }
                } else if (ex.type === 'Lieu') {
                    if (ex.startTime && ex.endTime) {
                        eH = `<div class="extra-shift" style="background:#fbbc04;color:#000;">🏛️ Partial Lieu</div>`; sC = 'M'; lbl = 'PARTIAL LIEU';
                    } else {
                        eH = `<div class="extra-shift" style="background:#fbbc04;color:#000;">🏛️ Lieu Day</div>`; sC = 'O'; lbl = 'LIEU DAY';
                    }
                } else if (ex.type === 'DropOff') {
                    eH = `<div class="extra-shift" style="background:var(--day);color:#fff;">💧 Drop Day</div>`; sC = 'O'; lbl = 'DROP OFF';
                } else if (ex.type === 'DropPaid') {
                    eH = `<div class="extra-shift" style="background:var(--off);color:#fff;">💰 Drop (Paid)</div>`; sC = 'M'; lbl = 'DROP PAID';
                }

                if (!['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) {
                    if (ex.type && ex.crew && ex.type !== 'DropPaid') {
                        eH = `<div class="extra-shift">${formatCrewLabel(ex.crew)} ${ex.type === 'Day' ? '☀️' : '🌙'}</div>`; sC = 'M'; lbl = ex.type === 'Day' ? 'DAY' : 'NIGHT';
                    }

                    let displayOT = ex.otHours || 0;
                    let displayDT = ex.dtHours || 0;
                    if (ex.type === 'DropPaid' && !ex.otHours && !ex.dtHours && (!ex.startTime || !ex.endTime)) displayOT = 12.0;

                    if (displayOT > 0.05) oH += `<div class="ot-badge">+${displayOT.toFixed(1)} OT</div>`;
                    if (displayDT > 0.05) oH += `<div class="ot-badge dt">+${displayDT.toFixed(1)} DT</div>`;

                    if (ex.startTime && ex.endTime) {
                        const dur   = getDuration(ex.startTime, ex.endTime);
                        const short = Math.max(0, baseH - dur);
                        if (short > 0.05) {
                            const vH = ex.vacHours || 0;
                            const uH = Math.max(0, short - vH);
                            if (uH > 0.05) oH += `<div class="ot-badge unpaid">-${uH.toFixed(1)}h UNPAID</div>`;
                            if (vH > 0.05) oH += `<div class="ot-badge" style="background:#00bcd4;color:#fff;">+${vH.toFixed(1)}h VAC</div>`;
                        }
                    }
                    if (oH) oH = `<div class="ot-container">${oH}</div>`;
                    if (ex.startTime || ex.endTime) tH = `<div class="shift-times">${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}</div>`;
                } else if (ex.startTime && ex.endTime) {
                    tH = `<div class="shift-times">${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}</div>`;
                }
            }

            const holInfo = yearHols[dStr];
            if (holInfo) eH += `<div class="hol-badge">⭐ ${holInfo.n}</div>`;

            if (f.isDropPeriod) {
                sC += ' drop-period';
                if (f.ppDayIndex === 0) alt += `<div class="drop-badge">💧 DROP</div>`;
            }
            const ppB = f.isPPBoundary
                ? `<div class="btn-pp-end" onclick="event.stopPropagation(); triggerBiometricsAndOpenPay(${f.ppIndex})">💰 View PP Log</div>`
                : '';
            if (f.isLockout && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex?.type)) {
                sC += ' lockout';
                eH += `<div class="lockout-badge">❌ 120H MAX</div>`;
            }

            const isToday     = (dStr === todayStr);
            const isPast      = (dStr < todayStr);
            const isCurrentPP = (f.ppIndex === currentTargetPPIndex);
            const timeC       = isToday ? 'today' : (isPast ? (isCurrentPP ? 'current-pp' : 'past') : (isCurrentPP ? 'current-pp' : ''));

            html += `<div class="day ${sC} ${timeC}" id="day-${dStr}" onclick="haptic(); openPickupSheet('${dStr}', '${months[m]} ${d}, ${year}', '${getShiftForCrew(pI, crew)}', '${next}')">${d}${alt}${oH}<div class="label">${lbl}</div>${tH}${eH}${ppB}</div>`;
        }
        fullCalendarHtml += html + `</div></div>`;
    }

    cal.innerHTML = fullCalendarHtml;
    setTimeout(scrollToToday, 200);
}
