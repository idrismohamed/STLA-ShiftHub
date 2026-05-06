const CALENDAR_VIEWS = ['month', 'agenda', 'week'];
let calendarViewMode = localStorage.getItem('calendarViewMode') || 'month';
const AGENDA_LOOKAHEAD_DAYS = 14;
let monthObserver = null;
let _calFirstRender = true;

function toggleCalendarView() {
    const currentIndex = CALENDAR_VIEWS.indexOf(calendarViewMode);
    const nextIndex = (currentIndex + 1) % CALENDAR_VIEWS.length;
    setCalendarViewMode(CALENDAR_VIEWS[nextIndex]);
}

function getNextViewLabel(mode) {
    if (mode === 'month') return 'Agenda';
    if (mode === 'agenda') return 'Week';
    return 'Month';
}

function setCalendarViewMode(mode) {
    calendarViewMode = mode;
    localStorage.setItem('calendarViewMode', mode);
    renderCalendar();
}

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

    const savedScrollY = window.scrollY;

    const yearSelect = document.getElementById('year-select');
    const crewSelect = document.getElementById('crew-select');
    const year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
    const viewMode = calendarViewMode;
    const viewToggle = document.getElementById('btn-view-toggle');
    if (viewToggle) viewToggle.innerText = getNextViewLabel(viewMode);

    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const currentTargetPPIndex = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const todayStr = toDateKey(nowUTC);

    precalcFatigue(year, crew);
    const yearHols = getHolidays(year);

    if (viewMode === 'agenda') {
        cal.innerHTML = renderAgendaView(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex);
        requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
        renderCalendarWidget(crew, logicalT, todayStr);
        renderDashboardCard(crew, logicalT);
        return;
    }
    if (viewMode === 'week') {
        cal.innerHTML = renderWeekView(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex);
        requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
        renderCalendarWidget(crew, logicalT, todayStr);
        renderDashboardCard(crew, logicalT);
        return;
    }

    // Disconnect any observer from a previous render pass
    if (monthObserver) { monthObserver.disconnect(); monthObserver = null; }

    // Create 12 lightweight placeholder wrappers — no day cells yet
    let skelHtml = '';
    for (let m = 0; m < 12; m++) skelHtml += `<div class="month-wrapper" data-month="${m}"></div>`;
    cal.innerHTML = skelHtml;

    const wrappers      = cal.querySelectorAll('.month-wrapper');
    const isCurrentYear = (year === logicalT.getFullYear());
    const todayMonthIdx = logicalT.getMonth();

    // Eagerly render the 3 months around today (or just January for other years)
    const eagerSet = new Set();
    if (isCurrentYear) {
        for (let d = -1; d <= 1; d++) eagerSet.add(((todayMonthIdx + d) % 12 + 12) % 12);
    } else {
        eagerSet.add(0);
    }

    wrappers.forEach((w, m) => {
        if (eagerSet.has(m)) {
            w.innerHTML = buildMonthHtml(m, year, crew, todayStr, yearHols, currentTargetPPIndex);
            w.dataset.rendered = '1';
        } else {
            w.style.minHeight = '340px'; // reserve space so scroll position is stable
        }
    });

    // Lazy-render remaining months as they scroll into proximity
    monthObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting || entry.target.dataset.rendered) return;
            entry.target.dataset.rendered = '1';
            entry.target.style.minHeight  = '';
            const m = parseInt(entry.target.dataset.month);
            entry.target.innerHTML = buildMonthHtml(m, year, crew, todayStr, yearHols, currentTargetPPIndex);
            monthObserver.unobserve(entry.target);
        });
    }, { rootMargin: '300px 0px' });

    wrappers.forEach(w => { if (!w.dataset.rendered) monthObserver.observe(w); });

    if (_calFirstRender) {
        _calFirstRender = false;
        setTimeout(scrollToToday, 50);
    } else {
        requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
    }
    renderCalendarWidget(crew, logicalT, todayStr);
    renderDashboardCard(crew, logicalT);
}

function buildMonthHtml(m, year, crew, todayStr, yearHols, currentTargetPPIndex) {
    const first  = new Date(year, m, 1);
    const last   = new Date(year, m + 1, 0);
    const startD = first.getDay();

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

        const ex    = extraShifts[dStr];
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
    return html + `</div></div>`;
}

function renderWeekView(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex) {
    const baseDate = (year === logicalT.getFullYear()) ? new Date(logicalT) : new Date(year, 0, 1);
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - baseDate.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    let html = `<div class="week-container"><div class="week-header"><div><div class="agenda-title">${weekLabel}</div><div class="agenda-subtitle">Crew ${crew}</div></div></div><div class="week-grid">`;

    for (let i = 0; i < 7; i++) {
        const target = new Date(weekStart);
        target.setDate(weekStart.getDate() + i);
        const targetUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
        const dStr = toDateKey(targetUTC);
        const pI = getPIndex(targetUTC);
        let shift = getShiftForCrew(pI, crew);
        let sC = shift;
        let lbl = shift === 'N' ? 'Night' : (shift === 'D' ? 'Day' : 'Off');
        let detail = '';
        let badgeHtml = '';
        const friendly = target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        const f = dayFatigue[dStr] || {};
        if (f.isLockout) { shift = 'O'; sC = 'O'; lbl = 'Off'; }

        const ex = extraShifts[dStr];
        if (ex) {
            if (ex.type === 'Vacation') lbl = ex.startTime || ex.endTime ? 'Partial Vacation' : 'Vacation';
            else if (ex.type === 'Off') lbl = ex.startTime || ex.endTime ? 'Partial Off' : 'Absence';
            else if (ex.type === 'Lieu') lbl = ex.startTime || ex.endTime ? 'Partial Lieu' : 'Lieu Day';
            else if (ex.type === 'DropOff') lbl = 'Drop Off';
            else if (ex.type === 'DropPaid') lbl = 'Drop Paid';
            else lbl = ex.type === 'Day' ? 'Day' : ex.type === 'Night' ? 'Night' : lbl;

            if (ex.startTime || ex.endTime) detail = `${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}`;
            if (ex.type && !['Vacation', 'Off', 'DropOff'].includes(ex.type)) badgeHtml += `<span class="agenda-badge">${ex.type}</span>`;
        }
        if (!detail && ['D', 'N'].includes(shift)) detail = shift === 'D' ? '06:30 - 18:30' : '18:30 - 06:30';

        const holInfo = yearHols[dStr];
        if (holInfo) badgeHtml += `<span class="agenda-badge">Holiday</span>`;
        if (f.isDropPeriod) badgeHtml += `<span class="agenda-badge">Drop Cycle</span>`;
        if (f.isLockout) badgeHtml += `<span class="agenda-badge">120H Max</span>`;

        html += `<div class="week-card ${sC} ${dStr === todayStr ? 'today' : ''} " onclick="haptic(); openPickupSheet('${dStr}', '${friendly}', '${getShiftForCrew(pI, crew)}', '${getShiftForCrew((pI + 1) % 28, crew)}')">
            <div class="week-day">${friendly}</div>
            <div class="week-label">${lbl}</div>
            <div class="week-detail">${detail || 'No time'}</div>
            <div class="week-badges">${badgeHtml}</div>
        </div>`;
    }

    html += '</div></div>';
    return html;
}

function renderDashboardCard(crew, logicalT) {
    const titleEl = document.getElementById('dashboard-next-shift');
    if (!titleEl) return;
    const next = getUpcomingShift(crew, logicalT);
    if (!next) {
        titleEl.innerText = 'No upcoming work shifts scheduled.';
        return;
    }
    const dateText = next.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const countdown = formatTimeUntil(next.date, logicalT);
    titleEl.innerText = `${dateText} · ${next.label} · ${next.timeText || next.schedule} · ${countdown}`;
}

function renderAgendaView(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex) {
    const pickerStart = (year === logicalT.getFullYear()) ? new Date(logicalT) : new Date(year, 0, 1);
    const agendaStart = new Date(pickerStart.getFullYear(), pickerStart.getMonth(), pickerStart.getDate());
    let html = `<div class="agenda-container"><div class="agenda-header"><div><div class="agenda-title">Upcoming ${AGENDA_LOOKAHEAD_DAYS} days</div><div class="agenda-subtitle">Crew ${crew}</div></div></div><div class="agenda-list">`;

    for (let i = 0; i < AGENDA_LOOKAHEAD_DAYS; i++) {
        const target = new Date(agendaStart);
        target.setDate(target.getDate() + i);
        const targetUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
        const dStr = toDateKey(targetUTC);
        const pI = getPIndex(targetUTC);
        let shift = getShiftForCrew(pI, crew);
        let sC = shift;
        let lbl = shift === 'N' ? 'Night' : (shift === 'D' ? 'Day' : 'Off');
        let details = '';
        let timeText = '';
        let badgeHtml = '';

        const f = dayFatigue[dStr] || {};
        if (f.isLockout) { shift = 'O'; sC = 'O'; lbl = 'Off'; }

        const ex = extraShifts[dStr];
        if (ex) {
            if (ex.type === 'Vacation') {
                lbl = ex.startTime || ex.endTime ? 'Partial Vacation' : 'Vacation';
            } else if (ex.type === 'Off') {
                lbl = ex.startTime || ex.endTime ? 'Partial Off' : 'Absence';
            } else if (ex.type === 'Lieu') {
                lbl = ex.startTime || ex.endTime ? 'Partial Lieu' : 'Lieu Day';
            } else if (ex.type === 'DropOff') {
                lbl = 'Drop Off';
            } else if (ex.type === 'DropPaid') {
                lbl = 'Drop Paid';
            } else {
                lbl = ex.type === 'Day' ? 'Day' : ex.type === 'Night' ? 'Night' : lbl;
            }

            if (ex.startTime || ex.endTime) {
                timeText = `${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}`;
            }
            if (ex.type && !['Vacation', 'Off', 'DropOff'].includes(ex.type)) {
                badgeHtml += `<span class="agenda-badge">${ex.type}</span>`;
            }
        }

        if (!timeText && ['D', 'N'].includes(shift)) {
            timeText = shift === 'D' ? '06:30 - 18:30' : '18:30 - 06:30';
        }

        const holInfo = yearHols[dStr];
        if (holInfo) badgeHtml += `<span class="agenda-badge">Holiday</span>`;
        if (f.isDropPeriod) badgeHtml += `<span class="agenda-badge">Drop Cycle</span>`;
        if (f.isLockout) badgeHtml += `<span class="agenda-badge">120H Max</span>`;

        const isToday = dStr === todayStr;
        const isPast = targetUTC < Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
        const timeC = isToday ? 'today' : (isPast ? 'past' : '');
        const currentPPClass = (f.ppIndex === currentTargetPPIndex) ? 'current-pp' : '';
        const friendlyDate = target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        html += `<div class="agenda-item ${sC} ${timeC} ${currentPPClass}" onclick="haptic(); openPickupSheet('${dStr}', '${friendlyDate}', '${getShiftForCrew(pI, crew)}', '${getShiftForCrew((pI + 1) % 28, crew)}')">
            <div class="agenda-meta">
                <div class="agenda-date">${friendlyDate}</div>
                <div class="agenda-status">${lbl}</div>
                <div class="agenda-badges">${badgeHtml}</div>
            </div>
            <div class="agenda-shift">${timeText || 'No shift time'}</div>
        </div>`;
    }

    html += '</div></div>';
    return html;
}

function renderCalendarWidget(crew, logicalT, todayStr) {
    const widget = document.getElementById('calendar-widget');
    if (!widget) return;

    const next = getUpcomingShift(crew, logicalT);
    const titleEl = document.getElementById('next-shift-title');
    const detailsEl = document.getElementById('next-shift-details');
    if (!titleEl || !detailsEl) return;

    if (!next) {
        titleEl.innerText = 'No upcoming shifts found';
        detailsEl.innerText = 'Try changing crew or adding a shift to your schedule.';
        return;
    }

    const shiftLabel = next.label;
    const dateText = next.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const scheduleText = next.schedule || (next.timeText || 'Full shift day');
    const countdown = formatTimeUntil(next.date, logicalT);

    titleEl.innerText = `${dateText} • ${shiftLabel}`;
    detailsEl.innerText = `${scheduleText} · ${countdown}`;
}

function getUpcomingShift(crew, fromDate) {
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    for (let i = 0; i < 30; i++) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const currentUTC = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
        const dStr = toDateKey(currentUTC);
        const pI = getPIndex(currentUTC);
        const baseShift = getShiftForCrew(pI, crew);
        const ex = extraShifts[dStr];
        const f = dayFatigue[dStr] || {};
        let label = baseShift === 'N' ? 'Night' : (baseShift === 'D' ? 'Day' : 'Off');
        let timeText = '';
        let schedule = '';
        let isWork = baseShift !== 'O';

        if (ex) {
            if (['Vacation', 'Off', 'DropOff'].includes(ex.type)) {
                isWork = false;
            } else {
                isWork = true;
                label = ex.type === 'Day' ? 'Day' : ex.type === 'Night' ? 'Night' : (ex.type === 'DropPaid' ? 'Drop Paid' : label);
                if (ex.startTime || ex.endTime) {
                    timeText = `${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}`;
                }
                schedule = ex.crew ? `${formatCrewLabel(ex.crew)} ${label}` : label;
            }
        }

        if (!ex && ['D', 'N'].includes(baseShift)) {
            timeText = baseShift === 'D' ? '06:30 - 18:30' : '18:30 - 06:30';
            schedule = `${label} shift`;
        }

        if (isWork) {
            return { date: current, label, timeText, schedule: schedule || timeText || label };
        }
    }
    return null;
}

function formatTimeUntil(targetDate, now) {
    const diffMs = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    if (diffMs <= 0) return 'Today';
    const days = Math.floor(diffMs / 86400000);
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
}
