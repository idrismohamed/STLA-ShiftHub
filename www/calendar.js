const CALENDAR_VIEWS = ['month', 'week', 'year'];
let calendarViewMode = localStorage.getItem('calendarViewMode') || 'week';
// Clamp stored view to valid values (agenda no longer exists)
if (!CALENDAR_VIEWS.includes(calendarViewMode)) calendarViewMode = 'week';
let currentCalMonth = parseInt(localStorage.getItem('currentCalMonth') || new Date().getMonth());
let currentWeekOffset = parseInt(localStorage.getItem('currentWeekOffset')) || 0;
let calMonthExpanded = localStorage.getItem('calMonthExpanded') !== 'false';

// Month drag tracking — direction-locked so vertical scroll still works
let _calDragStartX = 0, _calDragStartY = 0, _calDragActive = false;
let _calDragDx = 0, _calDragDir = null; // 'h' | 'v' | null

function _calPanelEl() { return document.getElementById('cal-month-panel') || document.getElementById('cal-year-panel'); }

function calDragStart(e) {
    _calDragStartX  = e.touches[0].clientX;
    _calDragStartY  = e.touches[0].clientY;
    _calDragActive  = true;
    _calDragDx      = 0;
    _calDragDir     = null;
    const el = _calPanelEl();
    if (el) { el.style.transition = 'none'; el.style.opacity = '1'; }
}

function calDragMove(e) {
    if (!_calDragActive) return;
    const dx = e.touches[0].clientX - _calDragStartX;
    const dy = e.touches[0].clientY - _calDragStartY;

    if (!_calDragDir) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // dead zone
        _calDragDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (_calDragDir !== 'h') return; // vertical — don't interfere

    _calDragDx = dx;
    const FREE = 60;
    const abs  = Math.abs(dx);
    const eff  = abs <= FREE ? abs : FREE + (abs - FREE) * 0.22;
    const el   = _calPanelEl();
    if (el) el.style.transform = `translateX(${Math.sign(dx) * eff}px)`;
    e.preventDefault();
}

function calDragEnd(e) {
    if (!_calDragActive) return;
    _calDragActive = false;
    _calDragDir    = null;
    const el = _calPanelEl();
    if (!el) return;
    const THRESHOLD = 55;
    if (_calDragDx < -THRESHOLD) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.4,0,1,1), opacity 0.25s ease';
        el.style.transform  = 'translateX(-60vw)';
        el.style.opacity    = '0.5';
        setTimeout(() => { haptic(); calendarViewMode === 'year' ? navigateYear(1) : navigateMonth(1); }, 230);
    } else if (_calDragDx > THRESHOLD) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.4,0,1,1), opacity 0.25s ease';
        el.style.transform  = 'translateX(60vw)';
        el.style.opacity    = '0.5';
        setTimeout(() => { haptic(); calendarViewMode === 'year' ? navigateYear(-1) : navigateMonth(-1); }, 230);
    } else {
        el.style.transition = 'none';
        if (window.Motion) {
            Motion.animate(el, { transform: 'translateX(0px)', opacity: 1 },
                { type: 'spring', stiffness: 280, damping: 18 });
        } else {
            el.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease';
            el.style.transform  = 'translateX(0)';
            el.style.opacity    = '1';
        }
    }
    _calDragDx = 0;
}

// PP swipe tracking — elastic overscroll only activates at scroll boundary
let _ppDragStartX = 0, _ppDragActive = false, _ppDragDx = 0;
let _ppEdgeHitX = null, _ppEdgeDir = 0;

function _ppSwipeEls() {
    return [document.getElementById('cal-pp-wrap'), document.querySelector('.cal-dow-row.week-mode')];
}
function _ppSetStyle(transition, transform, opacity) {
    for (const el of _ppSwipeEls()) {
        if (!el) continue;
        el.style.transition = transition;
        el.style.transform  = transform;
        el.style.opacity    = opacity;
    }
}

function ppDragStart(e) {
    _ppDragStartX = e.touches[0].clientX;
    _ppDragActive = true;
    _ppDragDx     = 0;
    _ppEdgeHitX   = null;
    _ppEdgeDir    = 0;
    _ppSetStyle('none', '', '1');
}

function ppDragMove(e) {
    if (!_ppDragActive) return;
    const touch  = e.touches[0];
    const rawDx  = touch.clientX - _ppDragStartX;
    const scroll = document.querySelector('.cal-scroll-area');
    const atLeft  = !scroll || scroll.scrollLeft <= 0;
    const atRight = !scroll || scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 1;

    if (_ppEdgeHitX === null) {
        // Only enter overscroll mode once we hit a boundary
        if      (rawDx >  8 && atLeft)  { _ppEdgeHitX = touch.clientX; _ppEdgeDir =  1; }
        else if (rawDx < -8 && atRight) { _ppEdgeHitX = touch.clientX; _ppEdgeDir = -1; }
        else return; // still scrolling normally — don't interfere
    }

    _ppDragDx = touch.clientX - _ppEdgeHitX;

    if (_ppDragDx * _ppEdgeDir < 0) {
        // user pulled back into the scroll area — cancel overscroll
        _ppEdgeHitX = null; _ppEdgeDir = 0; _ppDragDx = 0;
        _ppSetStyle('', 'translateX(0)', '1');
        return;
    }

    // Apply elastic resistance past the boundary
    const FREE = 55;
    const abs  = Math.abs(_ppDragDx);
    const eff  = abs <= FREE ? abs : FREE + (abs - FREE) * 0.22;
    const disp = Math.sign(_ppDragDx) * eff;
    for (const el of _ppSwipeEls()) { if (el) el.style.transform = `translateX(${disp}px)`; }
    e.preventDefault();
}

function ppDragEnd(e) {
    if (!_ppDragActive) return;
    _ppDragActive = false;
    const THRESHOLD = 45;
    if (_ppEdgeHitX !== null && Math.abs(_ppDragDx) > THRESHOLD) {
        const exitDir = _ppDragDx > 0 ? '55vw' : '-55vw';
        _ppSetStyle('transform 0.25s cubic-bezier(0.4,0,1,1), opacity 0.25s ease', `translateX(${exitDir})`, '0.5');
        const dir = -_ppEdgeDir;
        haptic();
        setTimeout(() => navigatePP(dir), 230);
    } else {
        if (window.Motion) {
            for (const el of _ppSwipeEls()) {
                if (!el) continue;
                el.style.transition = 'none';
                Motion.animate(el, { transform: 'translateX(0px)', opacity: 1 },
                    { type: 'spring', stiffness: 280, damping: 18 });
            }
        } else {
            _ppSetStyle('transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease', 'translateX(0)', '1');
        }
    }
    _ppEdgeHitX = null; _ppEdgeDir = 0; _ppDragDx = 0;
}
const AGENDA_LOOKAHEAD_DAYS = 14;
let monthObserver = null;
let _calFirstRender = true;


function setCalendarViewMode(mode) {
    const cal      = document.getElementById('calendar');
    const sideEl   = document.getElementById('analytics-side');
    const existing = cal?.firstElementChild;

    const doRender = () => {
        calendarViewMode = mode;
        localStorage.setItem('calendarViewMode', mode);
        renderCalendar();
        const newEl = cal?.firstElementChild;
        if (newEl) {
            if (window.Motion) {
                Motion.animate(newEl,
                    { opacity: [0, 1], transform: ['translateY(10px) scale(0.98)', 'translateY(0) scale(1)'] },
                    { duration: 0.28, easing: [0.25, 1, 0.5, 1] }
                );
            } else {
                newEl.style.transition = 'none';
                newEl.style.opacity    = '0';
                newEl.style.transform  = 'translateY(10px) scale(0.98)';
                requestAnimationFrame(() => {
                    newEl.style.transition = 'opacity 0.28s ease, transform 0.32s cubic-bezier(0.25,1,0.5,1)';
                    newEl.style.opacity    = '1';
                    newEl.style.transform  = 'translateY(0) scale(1)';
                });
            }
        }
        if (sideEl) {
            if (window.Motion) {
                Motion.animate(sideEl, { opacity: [0, 1] }, { duration: 0.32, easing: 'ease' });
            } else {
                sideEl.style.transition = 'none';
                sideEl.style.opacity    = '0';
                requestAnimationFrame(() => {
                    sideEl.style.transition = 'opacity 0.32s ease';
                    sideEl.style.opacity    = '1';
                });
            }
        }
    };

    if (existing) {
        if (window.Motion) {
            Motion.animate(existing,
                { opacity: 0, transform: 'translateY(-6px) scale(0.98)' },
                { duration: 0.14, easing: 'ease' }
            ).then(doRender);
            if (sideEl) Motion.animate(sideEl, { opacity: 0 }, { duration: 0.14, easing: 'ease' });
        } else {
            existing.style.transition = 'opacity 0.14s ease, transform 0.14s ease';
            existing.style.opacity    = '0';
            existing.style.transform  = 'translateY(-6px) scale(0.98)';
            if (sideEl) { sideEl.style.transition = 'opacity 0.14s ease'; sideEl.style.opacity = '0'; }
            setTimeout(doRender, 150);
        }
    } else {
        doRender();
    }
}

function toggleMonthPanel() {
    calMonthExpanded = !calMonthExpanded;
    localStorage.setItem('calMonthExpanded', calMonthExpanded);
    const panel = document.getElementById('cal-month-panel');
    const chevron = document.getElementById('cal-expand-chevron');
    if (panel) panel.classList.toggle('collapsed', !calMonthExpanded);
    if (chevron) chevron.classList.toggle('rotated', !calMonthExpanded);
    haptic();
}

function updateNavLabels() {
    const crewEl  = document.getElementById('nav-crew-display');
    const crewSel = document.getElementById('crew-select');
    if (crewEl && crewSel) crewEl.textContent = crewSel.value;
}

/** Navigate to today's month/PP then scroll the calendar into view and highlight today. */
function scrollToToday() {
    if (calendarViewMode === 'month') {
        const logicalT = getLogicalToday();
        const yearSelect = document.getElementById('year-select');
        const year = yearSelect ? parseInt(yearSelect.value) : logicalT.getFullYear();
        if (year === logicalT.getFullYear()) {
            currentCalMonth = logicalT.getMonth();
            localStorage.setItem('currentCalMonth', currentCalMonth);
            currentWeekOffset = 0;
            localStorage.setItem('currentWeekOffset', 0);
            renderCalendar();
        }
    } else if (calendarViewMode === 'week') {
        const prevOffset = currentWeekOffset;
        currentWeekOffset = 0;
        localStorage.setItem('currentWeekOffset', 0);
        if (prevOffset !== 0) {
            renderCalendar();
            requestAnimationFrame(() => {
                const wrap   = document.getElementById('cal-pp-wrap');
                const dowRow = document.querySelector('.cal-dow-row.week-mode');
                if (!wrap) return;
                const fromPx = prevOffset > 0 ? window.innerWidth * 0.55 : -window.innerWidth * 0.55;
                if (window.Motion) {
                    for (const el of [wrap, dowRow]) {
                        if (!el) continue;
                        Motion.animate(el,
                            { transform: [`translateX(${fromPx}px)`, 'translateX(0px)'], opacity: [0.5, 1] },
                            { type: 'spring', stiffness: 260, damping: 22 }
                        );
                    }
                } else {
                    for (const el of [wrap, dowRow]) { if (!el) continue; el.style.transition = 'none'; el.style.transform = `translateX(${fromPx}px)`; el.style.opacity = '0.5'; }
                    requestAnimationFrame(() => {
                        for (const el of [wrap, dowRow]) { if (!el) continue; el.style.transition = 'transform 0.38s cubic-bezier(0.25,1,0.5,1), opacity 0.3s ease'; el.style.transform = 'translateX(0)'; el.style.opacity = '1'; }
                    });
                }
            });
        }
        // Scroll page to calendar, then pulse today's card
        const calEl = document.getElementById('calendar');
        if (calEl) calEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            const todayCard = document.querySelector('.cal-week-card.today');
            if (todayCard) {
                todayCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                todayCard.classList.remove('today-pulse');
                void todayCard.offsetWidth;
                todayCard.classList.add('today-pulse');
                todayCard.addEventListener('animationend', () => todayCard.classList.remove('today-pulse'), { once: true });
            }
        }, prevOffset !== 0 ? 420 : 150);
        return;
    }
    const target = document.querySelector('.cal-analytics-row') || document.getElementById('calendar');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Main calendar entry point. Reads year from #year-select, crew from #crew-select.
 * Dispatches to month / week / year view renderers.
 */
function renderCalendar() {
    const cal = document.getElementById('calendar');
    if (!cal) return;

    const savedScrollY  = window.scrollY;
    const savedScrollX  = document.querySelector('.cal-scroll-area')?.scrollLeft ?? 0;
    const yearSelect = document.getElementById('year-select');
    const crewSelect = document.getElementById('crew-select');
    const year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
    const viewMode = calendarViewMode;

    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const currentTargetPPIndex = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const todayStr = toDateKey(nowUTC);

    precalcFatigue(year, crew);
    const yearHols = getHolidays(year);

    if (viewMode === 'week') {
        cal.innerHTML = renderWeekViewNew(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex);
        requestAnimationFrame(() => {
            window.scrollTo(0, savedScrollY);
            const sa = document.querySelector('.cal-scroll-area');
            if (sa) sa.scrollLeft = savedScrollX;
        });
        renderCalendarWidget(crew, logicalT, todayStr);
        renderDashboardCard(crew, logicalT);
        renderAnalyticsDashboard(crew, logicalT);
        return;
    }
    if (viewMode === 'year') {
        cal.innerHTML = renderYearView(year, crew, todayStr);
        requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
        renderCalendarWidget(crew, logicalT, todayStr);
        renderDashboardCard(crew, logicalT);
        renderAnalyticsDashboard(crew, logicalT);
        return;
    }

    // Month view — single month at a time
    if (monthObserver) { monthObserver.disconnect(); monthObserver = null; }

    // On first render, snap currentCalMonth to today's month if in current year
    if (_calFirstRender) {
        _calFirstRender = false;
        if (year === logicalT.getFullYear()) {
            currentCalMonth = logicalT.getMonth();
            localStorage.setItem('currentCalMonth', currentCalMonth);
        }
    }

    cal.innerHTML = buildNewMonthView(currentCalMonth, year, crew, todayStr, yearHols, currentTargetPPIndex);
    requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
    renderCalendarWidget(crew, logicalT, todayStr);
    renderDashboardCard(crew, logicalT);
    renderAnalyticsDashboard(crew, logicalT);
    updateNavLabels();
}

function renderWeekView(year, crew, logicalT, todayStr, yearHols) {
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

function renderCalendarWidget(crew, logicalT) {
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

/* ═══════════════════════════════════════════════════════════
   NEW CALENDAR REDESIGN — helper functions
   ═══════════════════════════════════════════════════════════ */

/** Build the crew selector bar rendered at the bottom of every calendar card. */
const LEGEND_HTML = `<div class="cal-legend">
    <div class="legend-item"><span class="dot" style="background-color:var(--night)"></span> Nights</div>
    <div class="legend-item"><span class="dot" style="background-color:var(--day)"></span> Days</div>
    <div class="legend-item"><span class="dot" style="background-color:var(--off)"></span> Off</div>
    <div class="legend-item"><span class="dot" style="background-color:var(--mod)"></span> Modified</div>
    <div class="legend-item">💧 Drop Day</div>
    <div class="legend-item">❌ 120H Max</div>
</div>`;

function buildViewBar(crew, ppIdx = null) {
    const opts = ['A','B','C','D'].map(c =>
        `<option value="${c}"${c === crew ? ' selected' : ''}>Crew ${c}</option>`).join('');
    const payArg = ppIdx !== null ? ppIdx : '';
    return `<div class="cal-week-bar">
        ${LEGEND_HTML}
        <div class="cal-view-bar-actions">
            <button class="cal-week-bar-btn" onclick="haptic(); triggerBiometricsAndOpenPay(${payArg})">💰 Pay Period</button>
            <div class="cal-crew-btn" style="margin-left:auto">
                <span>Crew ${crew}</span>
                <span class="cal-crew-chevron">▾</span>
                <select id="crew-select" class="pill-chip-select" onchange="haptic(); updateNavLabels(); renderCalendar()">${opts}</select>
            </div>
        </div>
    </div>`;
}

/** Build the shared .cal-header HTML with nav content on left and view tabs + today button on right. */
function buildCalendarHeader(viewMode, leftContent) {
    const tabs = CALENDAR_VIEWS.map(v => {
        const label = v.charAt(0).toUpperCase() + v.slice(1);
        return `<div class="cal-tab${v === viewMode ? ' active' : ''}" onclick="haptic(); setCalendarViewMode('${v}')">${label}</div>`;
    }).join('');
    return `<div class="cal-header"><div class="cal-header-left">${leftContent}</div><div class="cal-header-right"><div class="cal-view-tabs">${tabs}</div><button class="cal-today-top-btn" onclick="haptic(); scrollToToday()">Today</button></div></div>`;
}

/**
 * Build the pill descriptors for a single day cell.
 * Returns an ordered array of {cls, text} — PP pill is NOT included here.
 * @param {string} dStr
 * @param {string} shift  base shift after lockout adjustment ('D','N','O')
 * @param {object|undefined} ex  extraShifts[dStr]
 * @param {object} f  dayFatigue[dStr] || {}
 * @param {number} baseH  base work hours for this shift
 * @param {object} yearHols  holidays map
 */
function buildCellPills(dStr, shift, ex, f, baseH, yearHols) {
    const pills = [];

    // ── Primary pill ──────────────────────────────────────────────────────────
    let pCls = 'pill-off', pTxt = 'Off';

    if (ex) {
        const t = ex.type;
        const ht = ex.startTime && ex.endTime;
        const times = ht ? `${formatTime24(ex.startTime)}–${formatTime24(ex.endTime)}` : '';

        if (t === 'Vacation') {
            pCls = ht ? 'pill-mod' : 'pill-vac';
            pTxt = ht ? `🏖️ Partial Vac · ${times}` : '🏖️ Vacation';
        } else if (t === 'Off') {
            pCls = 'pill-absent';
            pTxt = ht ? `🚫 Partial Off · ${times}` : '🚫 Absent';
        } else if (t === 'Lieu') {
            pCls = 'pill-lieu';
            pTxt = ht ? `🏛️ Partial Lieu · ${times}` : '🏛️ Lieu Day';
        } else if (t === 'DropOff') {
            pCls = 'pill-drop'; pTxt = '💧 Drop Off';
        } else if (t === 'DropPaid') {
            pCls = 'pill-mod';
            pTxt = ht ? `💰 Drop Paid · ${times}` : '💰 Drop Paid';
        } else if (t === 'Day' || t === 'Night') {
            pCls = (t === 'Day' ? 'pill-day' : 'pill-night') + ' two-line';
            const icon = t === 'Day' ? '☀️' : '🌙';
            const defT = t === 'Day' ? '6:30–18:30' : '18:30–6:30';
            const disp = ht ? times : defT;
            const label = ex.crew ? `${icon} ${formatCrewLabel(ex.crew)}` : `${icon} ${t}`;
            pTxt = `<span class="pill-top">${label}</span><span class="pill-sub">${disp}</span>`;
        } else {
            // No recognized type — fall back to base rotation shift so D/N shifts with
            // custom times (e.g. early start) don't falsely display as "Off"
            if (shift === 'D') {
                pCls = 'pill-day two-line';
                const disp = ht ? times : '6:30–18:30';
                pTxt = `<span class="pill-top">☀️ Day</span><span class="pill-sub">${disp}</span>`;
            } else if (shift === 'N') {
                pCls = 'pill-night two-line';
                const disp = ht ? times : '18:30–6:30';
                pTxt = `<span class="pill-top">🌙 Night</span><span class="pill-sub">${disp}</span>`;
            }
        }
    } else if (f.isLockout) {
        pCls = 'pill-lock'; pTxt = '❌ Max Hours';
    } else if (shift === 'D') {
        pCls = 'pill-day two-line';
        pTxt = '<span class="pill-top">☀️ Day</span><span class="pill-sub">6:30–18:30</span>';
    } else if (shift === 'N') {
        pCls = 'pill-night two-line';
        pTxt = '<span class="pill-top">🌙 Night</span><span class="pill-sub">18:30–6:30</span>';
    }

    pills.push({ cls: pCls, text: pTxt });

    // ── Secondary pills ───────────────────────────────────────────────────────
    if (ex && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) {
        let displayOT = ex.otHours || 0;
        let displayDT = ex.dtHours || 0;
        if (ex.type === 'DropPaid' && !ex.otHours && !ex.dtHours && (!ex.startTime || !ex.endTime)) displayOT = 12.0;

        if (displayOT > 0.05) pills.push({ cls: 'pill-ot', text: `+${displayOT.toFixed(1)} OT` });
        if (displayDT > 0.05) pills.push({ cls: 'pill-dt', text: `+${displayDT.toFixed(1)} DT` });

        if (ex.startTime && ex.endTime) {
            const dur   = getDuration(ex.startTime, ex.endTime);
            const short = Math.max(0, baseH - dur);
            if (short > 0.05) {
                const vH = ex.vacHours || 0;
                const uH = Math.max(0, short - vH);
                if (uH > 0.05) pills.push({ cls: 'pill-unpaid', text: `-${uH.toFixed(1)}h Unpaid` });
                if (vH > 0.05) pills.push({ cls: 'pill-vac',    text: `+${vH.toFixed(1)}h Vac` });
            }
        }
    }

    // Drop cycle marker — only on the first day of a drop period
    if (f.isDropPeriod && f.ppDayIndex === 0) {
        pills.push({ cls: 'pill-drop', text: '💧 Drop Cycle' });
    }

    // Lockout secondary — when ex exists but doesn't fully override lockout
    if (f.isLockout && ex && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) {
        pills.push({ cls: 'pill-lock', text: '❌ Max' });
    }

    // Holiday
    const hol = yearHols[dStr];
    if (hol) pills.push({ cls: 'pill-hol', text: `⭐ ${hol.n}` });

    return pills;
}

/**
 * Build a single .cal-cell div — M3 simplified design.
 * Date circle + shift type label + abbreviated time + corner OT chip + flag icons.
 */
function buildCalCell(d, m, year, crew, todayStr, yearHols, currentTargetPPIndex) {
    const target = Date.UTC(year, m, d);
    const dStr   = toDateKey(target);
    const pI     = getPIndex(target);
    let   shift  = getShiftForCrew(pI, crew);
    const next   = getShiftForCrew((pI + 1) % 28, crew);
    const f      = dayFatigue[dStr] || {};
    const ex     = extraShifts[dStr];
    const baseH  = f.baseWorkHours !== undefined ? f.baseWorkHours : ((shift === 'D' || shift === 'N') ? 12 : 0);

    if (f.isLockout) shift = 'O';

    let sC = shift;
    if (ex) {
        if      (ex.type === 'Vacation') sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
        else if (ex.type === 'Off')      sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
        else if (ex.type === 'Lieu')     sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
        else if (ex.type === 'DropOff')  sC = 'O';
        else if (ex.type === 'DropPaid') sC = 'M';
        else if (ex.type === 'Day')  sC = 'D';
        else if (ex.type === 'Night') sC = 'N';
        else if (ex.type && ex.crew && ex.type !== 'DropPaid') sC = 'M';
    }

    const isToday     = (dStr === todayStr);
    const isPast      = (dStr < todayStr);
    const isCurrentPP = (f.ppIndex === currentTargetPPIndex);

    let cls = `cal-cell ${sC}`;
    cls += ` pp-${f.ppIndex !== undefined ? f.ppIndex % 4 : 0}`;
    if (isToday)                             cls += ' today';
    else if (isPast)                         cls += isCurrentPP ? ' current-pp past' : ' past';
    else if (isCurrentPP)                    cls += ' current-pp';
    if (f.isDropPeriod && f.ppDayIndex === 0) cls += ' drop-start';
    if (f.isLockout && !['Vacation','Off','DropOff','Lieu'].includes(ex?.type)) cls += ' lockout';
    if (f.isPPBoundary)                      cls += ' pp-end';

    // ── Shift type label + optional time ────────────────────────────────────
    let typeLabel = 'Off', timeLabel = '';
    if (ex) {
        const t  = ex.type;
        const ht = ex.startTime && ex.endTime;
        if (t === 'Vacation')      { typeLabel = ht ? '🏖️ Partial Vac' : '🏖️ Vacation'; sC += ' vac'; }
        else if (t === 'Off')      { typeLabel = ht ? '🚫 Partial' : '🚫 Absent'; }
        else if (t === 'Lieu')     { typeLabel = ht ? '🏛️ Partial' : '🏛️ Lieu'; }
        else if (t === 'DropOff')  { typeLabel = '💧 Drop'; }
        else if (t === 'DropPaid') { typeLabel = '💰 Drop+'; }
        else if (t === 'Day')      { typeLabel = '☀️ Day';   timeLabel = ht ? formatTime24(ex.startTime) : '6:30'; }
        else if (t === 'Night')    { typeLabel = '🌙 Night'; timeLabel = ht ? formatTime24(ex.startTime) : '18:30'; }
        else if (shift === 'D')    { typeLabel = '☀️ Day'; }
        else if (shift === 'N')    { typeLabel = '🌙 Night'; }
        if (ht && !timeLabel) timeLabel = formatTime24(ex.startTime);
    } else if (f.isLockout) {
        typeLabel = '❌ Max';
    } else if (shift === 'D') {
        typeLabel = '☀️ Day';   timeLabel = '6:30';
    } else if (shift === 'N') {
        typeLabel = '🌙 Night'; timeLabel = '18:30';
    }

    // ── OT/DT corner chip (show only the larger of the two) ─────────────────
    let otChip = '';
    if (ex && !['Vacation','Off','DropOff','Lieu'].includes(ex.type)) {
        let oH = ex.otHours || 0, dH = ex.dtHours || 0;
        if (ex.type === 'DropPaid' && !oH && !dH && (!ex.startTime || !ex.endTime)) oH = 12;
        if (dH > 0.05)      otChip = `<span class="cal-ot-chip dt">+${dH.toFixed(1)}DT</span>`;
        else if (oH > 0.05) otChip = `<span class="cal-ot-chip ot">+${oH.toFixed(1)}OT</span>`;
    }
    // Show short hour indicators for short shifts
    if (ex?.startTime && ex?.endTime) {
        const dur   = getDuration(ex.startTime, ex.endTime);
        const short = Math.max(0, baseH - dur);
        if (short > 0.05 && !otChip) {
            const uH = Math.max(0, short - (ex.vacHours || 0));
            if (uH > 0.05) otChip = `<span class="cal-ot-chip unpaid">-${uH.toFixed(1)}h</span>`;
        }
    }

    // ── Holiday flag ─────────────────────────────────────────────────────────
    const holFlag = yearHols[dStr]
        ? `<div class="cal-cell-flags"><span class="cal-flag hol-flag">⭐ ${yearHols[dStr].n.split(' ')[0]}</span></div>`
        : '';

    // ── Drop cycle start — top banner on first day ────────────────────────
    const dropBadge = (f.isDropPeriod && f.ppDayIndex === 0)
        ? `<div class="cal-drop-start">💧 Drop Cycle</div>`
        : '';

    // ── Pay period end — full-width tappable footer ───────────────────────
    const ppBadge = f.isPPBoundary
        ? `<button class="cal-pp-badge" onclick="event.stopPropagation(); haptic(); triggerBiometricsAndOpenPay(${f.ppIndex})">💰 PP End</button>`
        : '';

    const dispDate  = `${months[m]} ${d}, ${year}`;
    const baseShift = getShiftForCrew(pI, crew);

    return `<div class="${cls}" id="day-${dStr}" onclick="calDayClick('${dStr}','${dispDate}','${baseShift}','${next}')" ontouchstart="calLpStart(event,'${dStr}','${dispDate}','${baseShift}','${next}','month')" ontouchmove="calLpMove(event)" ontouchend="calLpEnd(event)" oncontextmenu="return false">
        ${dropBadge}
        <span class="cal-date-num">${d}</span>
        <span class="cal-cell-type">${typeLabel}</span>
        ${timeLabel ? `<span class="cal-cell-time">${timeLabel}</span>` : ''}
        ${holFlag}
        ${otChip}
        ${ppBadge}
    </div>`;
}

/** Build the M3-style "this week" row — always visible above the month panel. */
function buildM3WeekRow(crew, todayStr) {
    const today  = new Date(todayStr + 'T00:00:00');
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());

    const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html = '<div class="cal-week-row">';

    for (let i = 0; i < 7; i++) {
        const d    = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const tUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
        const dStr = toDateKey(tUTC);
        const pI   = getPIndex(tUTC);
        let shift  = getShiftForCrew(pI, crew);
        const f    = dayFatigue[dStr] || {};
        const ex   = extraShifts[dStr];

        if (f.isLockout) shift = 'O';
        let dotCls = shift; // D, N, O, M
        if (ex) {
            if (['Vacation','Off','DropOff','Lieu'].includes(ex.type)) dotCls = 'O';
            else if (ex.type === 'DropPaid') dotCls = 'M';
            else if (ex.type && ex.crew)     dotCls = 'M';
        }

        const isToday = dStr === todayStr;
        const isPast  = dStr < todayStr;
        let cls = 'cal-wr-day';
        if (isToday) cls += ' today';
        if (isPast)  cls += ' past';

        const dispDate  = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        const baseShift = getShiftForCrew(pI, crew);
        const next      = getShiftForCrew((pI + 1) % 28, crew);

        html += `<button class="${cls}" onclick="haptic(); openPickupSheet('${dStr}','${dispDate}','${baseShift}','${next}')">
            <span class="cal-wr-dow">${dowLabels[i]}</span>
            <span class="cal-wr-num">${d.getDate()}</span>
            <span class="cal-wr-dot ${dotCls}"></span>
        </button>`;
    }

    html += '</div>';
    return html;
}

/** Build the full single-month view HTML with collapsible month panel. */
function buildNewMonthView(m, year, crew, todayStr, yearHols, currentTargetPPIndex) {
    const monthLabel = `${months[m]} ${year}`;

    const yearSelect = document.getElementById('year-select');
    const minYear = yearSelect ? parseInt(yearSelect.options[0]?.value) : year;
    const maxYear = yearSelect ? parseInt(yearSelect.options[yearSelect.options.length - 1]?.value) : year;
    const canPrev = !(m === 0 && year <= minYear);
    const canNext = !(m === 11 && year >= maxYear);

    const leftContent = `
        <button class="cal-nav-btn" onclick="haptic(); navigateMonth(-1)" ${canPrev ? '' : 'disabled'}>&#8249;</button>
        <span class="cal-month-label">${monthLabel}</span>
        <button class="cal-nav-btn" onclick="haptic(); navigateMonth(1)" ${canNext ? '' : 'disabled'}>&#8250;</button>`;

    const header  = buildCalendarHeader('month', leftContent);
    const weekRow = buildM3WeekRow(crew, todayStr);
    const dowRow  = `<div class="cal-dow-row">${daysOfWeek.map(d => `<div class="cal-dow-cell">${d}</div>`).join('')}</div>`;

    const first    = new Date(year, m, 1);
    const last     = new Date(year, m + 1, 0);
    const startDay = first.getDay();

    let cells = '';
    for (let i = 0; i < startDay; i++) cells += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= last.getDate(); d++) cells += buildCalCell(d, m, year, crew, todayStr, yearHols, currentTargetPPIndex);

    return `<div class="cal-redesign" ontouchstart="calDragStart(event)" ontouchmove="calDragMove(event)" ontouchend="calDragEnd(event)">
        ${header}
        ${weekRow}
        <div class="cal-month-panel" id="cal-month-panel">
            ${dowRow}
            <div class="cal-grid">${cells}</div>
        </div>
        ${buildViewBar(crew)}
    </div>`;
}

/** Navigate the month view by dir (+1 or -1), crossing year boundaries as needed. */
function navigateMonth(dir) {
    const yearSelect = document.getElementById('year-select');
    let year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const savedMonth = currentCalMonth;

    currentCalMonth += dir;

    if (currentCalMonth < 0) {
        currentCalMonth = 11;
        year--;
    } else if (currentCalMonth > 11) {
        currentCalMonth = 0;
        year++;
    }

    if (yearSelect) {
        const opt = yearSelect.querySelector(`option[value="${year}"]`);
        if (!opt) {
            currentCalMonth = savedMonth; // revert to original month
            return;
        }
        yearSelect.value = year;
    }

    localStorage.setItem('currentCalMonth', currentCalMonth);
    renderCalendar();
    requestAnimationFrame(() => {
        const panel = document.getElementById('cal-month-panel');
        if (!panel) return;
        const fromPx = dir > 0 ? window.innerWidth * 0.6 : -window.innerWidth * 0.6;
        if (window.Motion) {
            Motion.animate(panel,
                { transform: [`translateX(${fromPx}px)`, 'translateX(0px)'], opacity: [0.5, 1] },
                { type: 'spring', stiffness: 260, damping: 22 }
            );
        } else {
            panel.style.transition = 'none';
            panel.style.transform  = `translateX(${fromPx}px)`;
            panel.style.opacity    = '0.5';
            requestAnimationFrame(() => {
                panel.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1), opacity 0.28s ease';
                panel.style.transform  = 'translateX(0)';
                panel.style.opacity    = '1';
            });
        }
    });
}

/** Build the new week view with prev/next navigation. */
function renderWeekViewNew(year, crew, logicalT, todayStr, yearHols, currentTargetPPIndex) {
    const nowUTC     = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const nowPPIdx   = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const tgtPPIdx   = nowPPIdx + currentWeekOffset;
    const ppStart    = basePPStartUTC + tgtPPIdx * MS_PP;
    const ppEnd      = ppStart + MS_PP_TO_END;

    // Ensure fatigue is calculated for the PP's year(s) — use UTC year from key
    const ppStartYear = +toDateKey(ppStart).substring(0, 4);
    const ppEndYear   = +toDateKey(ppEnd).substring(0, 4);
    precalcFatigue(ppStartYear, crew);
    if (ppEndYear !== ppStartYear) precalcFatigue(ppEndYear, crew);

    // Build combined holiday map covering both years the PP might span
    const holsMap = { ...getHolidays(ppStartYear) };
    if (ppEndYear !== ppStartYear) Object.assign(holsMap, getHolidays(ppEndYear));

    const isCurrentPPView = tgtPPIdx === nowPPIdx;
    const firstDayStr     = toDateKey(ppStart);
    const isDropPP        = (dayFatigue[firstDayStr] || {}).isDropPeriod === true;

    const utcFmt   = utc => { const s = toDateKey(utc).split('-'); return new Date(+s[0], +s[1]-1, +s[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const ppLabel  = `${utcFmt(ppStart)} – ${utcFmt(ppEnd)}`;

    const leftContent = `
        <button class="cal-nav-btn" onclick="haptic(); navigatePP(-1)">&#8249;</button>
        <div class="cal-pp-label-wrap${isCurrentPPView ? ' cal-pp-label-current' : ''}">
            <span class="cal-month-label" style="font-size:14px">${ppLabel}</span>
        </div>
        <button class="cal-nav-btn" onclick="haptic(); navigatePP(1)">&#8250;</button>`;

    const header = buildCalendarHeader('week', leftContent);

    // DOW header aligned to PP start day-of-week (use UTC day)
    const ppStartDow  = new Date(ppStart).getUTCDay(); // UTC midnight → correct DOW
    const orderedDows = [...daysOfWeek.slice(ppStartDow), ...daysOfWeek.slice(0, ppStartDow)];
    const dowRow = `<div class="cal-dow-row week-mode">${orderedDows.map(d => `<div class="cal-dow-cell">${d}</div>`).join('')}</div>`;

    // Build 14 day cards (2 rows of 7)
    let cards = '';
    for (let i = 0; i < 14; i++) {
        const tUTC  = ppStart + i * MS_DAY;
        const dStr  = toDateKey(tUTC);
        const pI    = getPIndex(tUTC);
        let   shift = getShiftForCrew(pI, crew);
        const next  = getShiftForCrew((pI + 1) % 28, crew);
        const f     = dayFatigue[dStr] || {};
        const ex    = extraShifts[dStr];
        const baseH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((shift === 'D' || shift === 'N') ? 12 : 0);

        if (f.isLockout) shift = 'O';

        let sC = shift;
        if (ex) {
            if      (ex.type === 'Vacation') sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
            else if (ex.type === 'Off')      sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
            else if (ex.type === 'Lieu')     sC = (ex.startTime && ex.endTime) ? 'M' : 'O';
            else if (ex.type === 'DropOff')  sC = 'O';
            else if (ex.type === 'DropPaid') sC = 'M';
            else if (ex.type === 'Day')      sC = 'D';
            else if (ex.type === 'Night')    sC = 'N';
            else if (ex.type && ex.crew && ex.type !== 'DropPaid') sC = 'M';
        }

        const isToday     = dStr === todayStr;
        const isPast      = dStr < todayStr;
        const isCurrentPP = f.ppIndex === currentTargetPPIndex;

        let cardCls = `cal-week-card ${sC}`;
        cardCls += ` pp-${f.ppIndex !== undefined ? f.ppIndex % 4 : 0}`;
        if (isToday)          cardCls += ' today';
        else if (isPast)      cardCls += isCurrentPP ? ' current-pp past' : ' past';
        else if (isCurrentPP) cardCls += ' current-pp';
        if (f.isLockout && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex?.type)) cardCls += ' lockout';

        const [dy, dm, dd] = dStr.split('-').map(Number);
        const localDate = new Date(dy, dm - 1, dd);
        const dateLabel = localDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        const friendly  = localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        // Drop cycle is shown in the header for the week view — omit from individual cards
        const pills    = buildCellPills(dStr, shift, ex, f, baseH, holsMap)
            .filter(p => !(p.cls === 'pill-drop' && p.text === '💧 Drop Cycle'));
        const visible  = pills.slice(0, 5);
        const overflow = pills.length - 5;

        let pillsHtml = '<div class="cal-pills">';
        for (const p of visible) pillsHtml += `<div class="cal-pill ${p.cls}">${p.text}</div>`;
        if (overflow > 0) pillsHtml += `<div class="cal-see-more">+${overflow} more</div>`;
        pillsHtml += '</div>';

        // Insert row divider before the 8th card (split into two rows of 7)
        if (i === 7) cards += '</div><div class="cal-pp-row-gap"></div><div class="cal-week-grid">';

        cards += `<div class="${cardCls}" onclick="calDayClick('${dStr}','${friendly}','${shift}','${next}')" ontouchstart="calLpStart(event,'${dStr}','${friendly}','${shift}','${next}')" ontouchmove="calLpMove(event)" ontouchend="calLpEnd(event)" oncontextmenu="return false">
            <div class="cal-week-date">${dateLabel}</div>
            ${pillsHtml}
        </div>`;
    }

    let _dropBanner = '';
    if (isDropPP) {
        _dropBanner = `<div class="cal-drop-pp-banner">💧 Drop Cycle</div>`;
    } else {
        let _ndi = tgtPPIdx + 1;
        while ((_ndi % 3) !== 1) _ndi++;
        const _daysUntil = Math.floor((basePPStartUTC + _ndi * MS_PP - nowUTC) / MS_DAY);
        if (_daysUntil > 0 && _daysUntil <= 14) {
            _dropBanner = `<div class="cal-drop-pp-banner upcoming">💧 Drop Cycle in ${_daysUntil} day${_daysUntil !== 1 ? 's' : ''}</div>`;
        }
    }

    return `<div class="cal-redesign" ontouchstart="ppDragStart(event)" ontouchmove="ppDragMove(event)" ontouchend="ppDragEnd(event)">
        ${header}
        ${_dropBanner}
        <div class="cal-scroll-area">
            ${dowRow}
            <div id="cal-pp-wrap" class="cal-pp-wrap">
                <div class="cal-week-grid">${cards}</div>
            </div>
        </div>
        ${buildViewBar(crew, tgtPPIdx)}
    </div>`;
}

/** Navigate the PP view by dir pay periods, with a slide-in animation. */
function navigatePP(dir) {
    currentWeekOffset += dir;
    localStorage.setItem('currentWeekOffset', currentWeekOffset);
    renderCalendar();
    requestAnimationFrame(() => {
        const wrap   = document.getElementById('cal-pp-wrap');
        const dowRow = document.querySelector('.cal-dow-row.week-mode');
        if (!wrap) return;
        const fromPx = dir > 0 ? window.innerWidth * 0.55 : -window.innerWidth * 0.55;
        if (window.Motion) {
            for (const el of [wrap, dowRow]) {
                if (!el) continue;
                Motion.animate(el,
                    { transform: [`translateX(${fromPx}px)`, 'translateX(0px)'], opacity: [0.5, 1] },
                    { type: 'spring', stiffness: 260, damping: 22 }
                );
            }
        } else {
            for (const el of [wrap, dowRow]) { if (!el) continue; el.style.transition = 'none'; el.style.transform = `translateX(${fromPx}px)`; el.style.opacity = '0.5'; }
            requestAnimationFrame(() => {
                for (const el of [wrap, dowRow]) { if (!el) continue; el.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1), opacity 0.28s ease'; el.style.transform = 'translateX(0)'; el.style.opacity = '1'; }
            });
        }
    });
}

/** Alias kept for any existing references. */
function navigateWeek(dir) { navigatePP(dir); }

/** Build the year overview with 12 mini-month grids. */
function renderYearView(year, crew, todayStr) {
    const yearSelect = document.getElementById('year-select');
    const minYear = yearSelect ? parseInt(yearSelect.options[0]?.value) : year;
    const maxYear = yearSelect ? parseInt(yearSelect.options[yearSelect.options.length - 1]?.value) : year;

    const leftContent = `
        <button class="cal-nav-btn" onclick="haptic(); navigateYear(-1)" ${year <= minYear ? 'disabled' : ''}>&#8249;</button>
        <span class="cal-month-label">${year}</span>
        <button class="cal-nav-btn" onclick="haptic(); navigateYear(1)" ${year >= maxYear ? 'disabled' : ''}>&#8250;</button>`;
    const header = buildCalendarHeader('year', leftContent);

    let miniMonths = '';
    for (let m = 0; m < 12; m++) miniMonths += buildMiniMonth(m, year, crew, todayStr);

    return `<div class="cal-redesign" ontouchstart="calDragStart(event)" ontouchmove="calDragMove(event)" ontouchend="calDragEnd(event)">${header}<div class="cal-year-view" id="cal-year-panel">${miniMonths}</div>${buildViewBar(crew)}</div>`;
}

/** Navigate the year view by dir (+1 or -1). */
function navigateYear(dir) {
    const yearSelect = document.getElementById('year-select');
    if (!yearSelect) return;
    const newYear = parseInt(yearSelect.value) + dir;
    const opt = yearSelect.querySelector(`option[value="${newYear}"]`);
    if (!opt) return;
    yearSelect.value = newYear;
    renderCalendar();
}

/** Build a compact mini-month grid for the year overview. */
function buildMiniMonth(m, year, crew, todayStr) {
    const first    = new Date(year, m, 1);
    const last     = new Date(year, m + 1, 0);
    const startDay = first.getDay();
    const miniDow  = ['S','M','T','W','T','F','S'];

    let grid = `<div class="cal-mini-grid">`;
    for (const d of miniDow) grid += `<div class="cal-mini-dow">${d}</div>`;
    for (let i = 0; i < startDay; i++) grid += `<div class="cal-mini-day"></div>`;

    let mmD = 0, mmN = 0, mmOT = 0, mmDrop = false;

    for (let d = 1; d <= last.getDate(); d++) {
        const tUTC  = Date.UTC(year, m, d);
        const dStr  = toDateKey(tUTC);
        const pI    = getPIndex(tUTC);
        let   shift = getShiftForCrew(pI, crew);
        const ex    = extraShifts[dStr];
        const f     = dayFatigue[dStr] || {};

        if (f.isLockout) shift = 'O';
        if (ex) {
            if (['Vacation','Off','DropOff','Lieu'].includes(ex.type)) shift = 'O';
            else if (ex.type === 'Day')    shift = 'D';
            else if (ex.type === 'Night')  shift = 'N';
            else if (ex.type === 'DropPaid' || ex.crew) shift = 'M';
        }

        if (shift === 'D') mmD++;
        else if (shift === 'N') mmN++;
        if (ex) mmOT += (ex.otHours || 0) + (ex.dtHours || 0);
        if (f.isDropPeriod) mmDrop = true;

        const isToday  = dStr === todayStr;
        const dotHtml  = (!isToday && shift !== 'O') ? `<div class="cal-mini-dot ${shift}"></div>` : '';
        grid += `<div class="cal-mini-day${isToday ? ' today-dot' : ''}">${d}${dotHtml}</div>`;
    }

    grid += '</div>';
    const otBadge  = mmOT > 0   ? `<span class="cal-mini-ot-badge">+${mmOT.toFixed(0)}h</span>` : '';
    const dropIcon = mmDrop      ? `<span class="cal-mini-drop">💧</span>` : '';
    const summary  = `<div class="cal-mini-summary"><span>☀️${mmD} 🌙${mmN}</span><span>${otBadge}${dropIcon}</span></div>`;
    return `<div class="cal-mini-month" onclick="haptic(); navigateToMonth(${m},${year})"><div class="cal-mini-month-title">${months[m].substring(0,3)}</div>${grid}${summary}</div>`;
}

/** Navigate from year view to a specific month in month view. */
function navigateToMonth(m, year) {
    currentCalMonth = m;
    localStorage.setItem('currentCalMonth', m);
    const yearSelect = document.getElementById('year-select');
    if (yearSelect) yearSelect.value = year;
    setCalendarViewMode('month');
    requestAnimationFrame(() => {
        const target = document.querySelector('.cal-analytics-row') || document.getElementById('calendar');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

/** Render the four-section analytics dashboard below the calendar. */
function renderAnalyticsDashboard(crew, logicalT) {
    const elSide  = document.getElementById('analytics-side');
    const elBelow = document.getElementById('analytics-below');
    if (!elSide && !elBelow) return;

    const nowUTC    = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const todayStr  = toDateKey(nowUTC);
    const currentPP = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const ppS       = basePPStartUTC + currentPP * MS_PP;
    const ppE          = ppS + MS_PP_TO_END;
    const targetYear   = new Date(ppE).getUTCFullYear();
    const ppDayIndex   = Math.min(13, Math.floor((nowUTC - ppS) / MS_DAY));
    const ppDayDisplay = ppDayIndex + 1;
    const ppDaysLeft   = 14 - ppDayDisplay;
    const ppPct        = Math.round((ppDayDisplay / 14) * 100);

    // Ensure fatigue is computed for the current (real) year
    precalcFatigue(targetYear, crew);

    const holCache = {};
    const getHols  = y => { if (!holCache[y]) holCache[y] = getHolidays(y); return holCache[y]; };

    // Find first PP of targetYear
    let firstPP = 0;
    for (let i = currentPP; i >= 0; i--) {
        const testE = basePPStartUTC + (i * 14 + 13) * MS_DAY;
        if (new Date(testE).getUTCFullYear() < targetYear) { firstPP = i + 1; break; }
        if (i === 0) firstPP = 0;
    }
    const ppCount = getPayPeriodsInYear(targetYear);

    // ── Current PP + YTD loop ────────────────────────────────
    let regH = 0, ot = 0, dt = 0, gross = 0;
    let aftH = 0, nightH = 0, satH = 0, sunH = 0;
    let ytdGross = 0, ytdCPP = 0, ytdEI = 0, ppsDone = 0;

    for (let pi = firstPP; pi <= currentPP; pi++) {
        const s = basePPStartUTC + pi * MS_PP;
        let piGross = 0, piRegH = 0, piOT = 0, piDT = 0;
        let piAft = 0, piNight = 0, piSat = 0, piSun = 0;

        for (let d = 0; d <= 13; d++) {
            const u   = s + d * MS_DAY;
            const dS  = toDateKey(u);
            const bS  = getShiftForCrew(getPIndex(u), crew);
            const ex  = extraShifts[dS];
            const f   = dayFatigue[dS] || {};
            const bH  = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);
            const st  = ex?.startTime || ((bS === 'D' || ex?.type === 'Day') ? '06:30' : '18:30');

            let act = bH, isVac = false;
            if (ex) {
                if      (ex.type === 'DropOff')                    { act = 0; }
                else if (ex.type === 'DropPaid')                   { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; }
                else if (ex.type === 'Vacation')                   { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; }
                else if (ex.type === 'Off' || ex.type === 'Lieu')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
                else if (ex.startTime && ex.endTime)               { act = getDuration(ex.startTime, ex.endTime); }
                else if (ex.type)                                  { act = 12; }
            }
            if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') act = 0;

            const dayR = Math.min(act, bH);
            const dayE = Math.max(0, act - bH);

            let rate = sysSettings.regRate;
            if (ex?.role === 'TL')                              rate = sysSettings.tlRate;
            else if (ex?.role === 'Manual' && ex?.manualRate)   rate = ex.manualRate;

            piRegH += dayR;

            if (isVac) {
                const vH = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? Math.max(0, bH - act) : (bH || 12));
                piGross += vH * rate;
            }

            if (!f.isLockout && act > 0) {
                const pD = calcPremiums(dS, st, dayR, rate);
                piGross += (dayR * rate) + pD.total;
                piAft   += pD.aftHrs; piNight += pD.nightHrs; piSat += pD.satHrs; piSun += pD.sunHrs;

                if (dayE > 0) {
                    let sO = ex?.otHours || 0, sD = ex?.dtHours || 0;
                    if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                    piGross += (sO * rate * 1.5) + (sD * rate * 2.0);
                    piOT += sO; piDT += sD;
                }
            }

            const holYear = parseInt(dS.substring(0, 4));
            const holInfo = getHols(holYear)[dS];
            if (holInfo) {
                piGross += 8 * rate;
                if (dayR > 0) piGross += dayR * rate * (holInfo.m === 2.0 ? 1.0 : 0.5);
            }
            const nextDStr    = toDateKey(u + MS_DAY);
            const nextHolInfo = getHols(parseInt(nextDStr.substring(0, 4)))[nextDStr];
            if (nextHolInfo && dayR > 0 && (bS === 'N' || ex?.type === 'Night')) {
                piGross += Math.min(dayR, 10) * rate * (nextHolInfo.m === 2.0 ? 1.0 : 0.5);
            }
        }

        const piTax = calculateTaxes(piGross, pi, targetYear);
        ytdGross += piGross; ytdCPP += piTax.cpp + piTax.cpp2; ytdEI += piTax.ei; ppsDone++;

        if (pi === currentPP) {
            gross = piGross; regH = piRegH; ot = piOT; dt = piDT;
            aftH = piAft; nightH = piNight; satH = piSat; sunH = piSun;
        }
    }

    const t = calculateTaxes(gross, currentPP, targetYear);

    // ── Month stats ──────────────────────────────────────────
    const yearSelect   = document.getElementById('year-select');
    const displayYear  = yearSelect ? parseInt(yearSelect.value) : targetYear;
    const displayMonth = calendarViewMode === 'month' ? currentCalMonth : logicalT.getMonth();

    if (displayYear !== targetYear) precalcFatigue(displayYear, crew);

    let dCount = 0, nCount = 0, oCount = 0, totalMonthHours = 0;
    let vacDays = 0, dropDays = 0, lieuDays = 0, absenceDays = 0;
    let monthOT = 0, monthDT = 0;

    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const u  = Date.UTC(displayYear, displayMonth, d);
        const dS = toDateKey(u);
        const bS = getShiftForCrew(getPIndex(u), crew);
        const ex = extraShifts[dS];
        const f  = dayFatigue[dS] || {};
        const bH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);

        let eff = bS;
        if (f.isLockout) eff = 'O';
        let hours = bH;

        if (ex) {
            if      (ex.type === 'Vacation') { vacDays++;     hours = 0; eff = 'O'; }
            else if (ex.type === 'Off')      { absenceDays++; hours = 0; eff = 'O'; }
            else if (ex.type === 'Lieu')     { lieuDays++;    hours = 0; eff = 'O'; }
            else if (ex.type === 'DropOff')  { dropDays++;    hours = 0; eff = 'O'; }
            else if (ex.type === 'DropPaid') {
                hours = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12;
                if (eff === 'O') eff = 'D'; // DropPaid on an off day still counts as worked
            }
            else if (ex.type === 'Day') {
                eff = 'D';
                hours = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12;
            }
            else if (ex.type === 'Night') {
                eff = 'N';
                hours = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12;
            }
            else if (ex.startTime && ex.endTime) { hours = getDuration(ex.startTime, ex.endTime); }
        }
        if (f.isLockout) hours = 0;

        const dayE = Math.max(0, hours - bH);
        if (dayE > 0 && !f.isLockout) {
            let sO = ex?.otHours || 0, sD = ex?.dtHours || 0;
            if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
            monthOT += sO; monthDT += sD;
        }

        if      (eff === 'D') dCount++;
        else if (eff === 'N') nCount++;
        else                  oCount++;
        totalMonthHours += hours;
    }

    // Re-enable correct fatigue for rest of page if we had to swap
    if (displayYear !== targetYear) precalcFatigue(targetYear, crew);

    // ── Last month stats (for comparison card) ───────────────
    const thisWorked = dCount + nCount;
    const prevMonth  = displayMonth === 0 ? 11 : displayMonth - 1;
    const prevYear   = displayMonth === 0 ? displayYear - 1 : displayYear;

    if (prevYear !== targetYear) precalcFatigue(prevYear, crew);

    let prevWorked = 0, prevTotalHours = 0, prevMonthOT = 0, prevMonthDT = 0;
    let prevVacDays = 0, prevAbsDays = 0;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    for (let d2 = 1; d2 <= daysInPrevMonth; d2++) {
        const u2  = Date.UTC(prevYear, prevMonth, d2);
        const dS2 = toDateKey(u2);
        const bS2 = getShiftForCrew(getPIndex(u2), crew);
        const ex2 = extraShifts[dS2];
        const f2  = dayFatigue[dS2] || {};
        const bH2 = f2.baseWorkHours !== undefined ? f2.baseWorkHours : ((bS2 === 'D' || bS2 === 'N') ? 12 : 0);

        let eff2 = bS2;
        if (f2.isLockout) eff2 = 'O';
        let hours2 = bH2;

        if (ex2) {
            if      (ex2.type === 'Vacation') { prevVacDays++; hours2 = 0; eff2 = 'O'; }
            else if (ex2.type === 'Off')      { prevAbsDays++; hours2 = 0; eff2 = 'O'; }
            else if (ex2.type === 'Lieu')     {                hours2 = 0; eff2 = 'O'; }
            else if (ex2.type === 'DropOff')  {                hours2 = 0; eff2 = 'O'; }
            else if (ex2.type === 'DropPaid') { hours2 = (ex2.startTime && ex2.endTime) ? getDuration(ex2.startTime, ex2.endTime) : 12; if (eff2 === 'O') eff2 = 'D'; }
            else if (ex2.type === 'Day')      { eff2 = 'D'; hours2 = (ex2.startTime && ex2.endTime) ? getDuration(ex2.startTime, ex2.endTime) : 12; }
            else if (ex2.type === 'Night')    { eff2 = 'N'; hours2 = (ex2.startTime && ex2.endTime) ? getDuration(ex2.startTime, ex2.endTime) : 12; }
            else if (ex2.startTime && ex2.endTime) { hours2 = getDuration(ex2.startTime, ex2.endTime); }
        }
        if (f2.isLockout) hours2 = 0;

        const dayE2 = Math.max(0, hours2 - bH2);
        if (dayE2 > 0 && !f2.isLockout) {
            let sO2 = ex2?.otHours || 0, sD2 = ex2?.dtHours || 0;
            if (sO2 === 0 && sD2 === 0) { if (ex2?.type === 'DropPaid') sO2 = dayE2; else sD2 = dayE2; }
            prevMonthOT += sO2; prevMonthDT += sD2;
        }
        if (eff2 === 'D' || eff2 === 'N') prevWorked++;
        prevTotalHours += hours2;
    }

    if (prevYear !== targetYear) precalcFatigue(targetYear, crew);

    const fDelta = n => { const r = Math.round(n * 10) / 10; return r === 0 ? '—' : (r > 0 ? '+' : '') + r; };
    const prevMonthName = months[prevMonth].slice(0, 3);
    const thisMonthName = months[displayMonth].slice(0, 3);

    // ── Vacation balance ─────────────────────────────────────
    const vacUsed  = getUsedVacationHours(crew, todayStr);
    const vacLimit = sysSettings.vacationLimit || 150;
    const vacRem   = Math.max(0, vacLimit - vacUsed);
    const vacPct   = Math.min(100, Math.round((vacUsed / vacLimit) * 100));
    const { start: vacStart, end: vacEnd } = getVacationCycle(todayStr);

    // ── Lieu / Drop Day balances ──────────────────────────────
    const lieuBanked = computeLieuBalance(todayStr, crew, null);
    let lieuTaken = 0, dropOffTaken = 0, dropPaidTaken = 0;
    const cycleStart = Date.UTC(targetYear, 0, 1);
    const cycleEnd   = Date.UTC(targetYear, 11, 31);
    for (const [dS, ex] of Object.entries(extraShifts)) {
        const u = Date.UTC(parseInt(dS.substring(0,4)), parseInt(dS.substring(5,7))-1, parseInt(dS.substring(8,10)));
        if (u < cycleStart || u > cycleEnd) continue;
        if (ex.type === 'Lieu')     lieuTaken++;
        else if (ex.type === 'DropOff')  dropOffTaken++;
        else if (ex.type === 'DropPaid') dropPaidTaken++;
    }

    // ── YTD projection ───────────────────────────────────────
    const ppRemaining     = Math.max(0, ppCount - ppsDone);
    const projectedAnnual = ppsDone > 0 ? ytdGross + (ytdGross / ppsDone) * ppRemaining : 0;

    const _tbl = getTaxYear(targetYear);
    const annCPPMax = _tbl.annCPPMax + _tbl.annCPP2Max;
    const annEIMax  = _tbl.annEIMax;

    const cppPct = Math.min(100, Math.round((ytdCPP / annCPPMax) * 100));
    const eiPct  = Math.min(100, Math.round((ytdEI  / annEIMax)  * 100));

    const ppStartLabel = new Date(ppS).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ppEndLabel   = new Date(ppE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const f$  = n => '$' + n.toFixed(2);
    const fH  = n => n.toFixed(1) + ' hrs';

    const monthExRows = [
        vacDays    > 0 ? `<div class="an-row"><span>Vacation</span><strong style="color:#00bcd4">${vacDays}d</strong></div>` : '',
        absenceDays> 0 ? `<div class="an-row"><span>Absences</span><strong style="color:var(--night)">${absenceDays}d</strong></div>` : '',
        dropDays   > 0 ? `<div class="an-row"><span>Drop Days</span><strong style="color:var(--day)">${dropDays}d</strong></div>` : '',
        lieuDays   > 0 ? `<div class="an-row"><span>Lieu Days</span><strong style="color:#fbbc04">${lieuDays}d</strong></div>` : '',
    ].join('');

    const fatigueUsed  = regH + ot + dt;
    const fatigueRem   = Math.max(0, 120 - fatigueUsed);
    const fatiguePct   = Math.min(100, Math.round((fatigueUsed / 120) * 100));
    const fatigueColor = fatigueUsed >= 108 ? 'var(--night)' : fatigueUsed >= 90 ? 'var(--accent)' : '#34d399';
    const fatigueAtMax = fatigueUsed >= 120;
    const fatigueRightLabel = fatigueAtMax ? '' : `<span style="color:${fatigueColor};font-weight:700">${fatigueRem.toFixed(1)}h left</span>`;
    const ppHoursMicro = (ot + dt > 0) ? `<div class="an-hero-micro">+${(ot + dt).toFixed(1)}h OT/DT</div>` : '';

    const elTop = document.getElementById('pp-top-summary');
    if (elTop) elTop.innerHTML = `
<div class="pp-top-wrap">
  <div class="an-flat-card" style="margin-bottom:0;border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;">
    <div class="an-flat-card-title">Current Pay Period <span class="an-section-sub" style="text-transform:none;letter-spacing:0;font-size:10px">${ppStartLabel}–${ppEndLabel}</span></div>
    <div class="an-pp-bar-labels"><span>Day ${ppDayDisplay} of 14</span><span>${ppDaysLeft} day${ppDaysLeft !== 1 ? 's' : ''} left</span></div>
    <div class="an-progress" style="margin:5px 0 8px"><div class="an-progress-fill" style="width:${ppPct}%;background:var(--accent)"></div></div>
    <div class="an-pp-bar-labels"><span style="color:${fatigueAtMax ? 'var(--night)' : 'var(--text-muted)'}">120h Fatigue — ${fatigueAtMax ? '⛔ MAX REACHED' : fatigueUsed.toFixed(1) + 'h used'}</span>${fatigueRightLabel}</div>
    <div class="an-progress" style="margin:4px 0 0"><div class="an-progress-fill" style="width:${fatiguePct}%;background:${fatigueColor}"></div></div>
  </div>
  <div class="an-grid-3" style="margin:0;border-top-left-radius:0;border-top-right-radius:0;">
    <div class="an-hero-card" style="--hero-color:#7c3aed;border-top-left-radius:0;border-top-right-radius:0;">
      <div class="an-hero-label">Gross</div>
      <div class="an-hero-value">${f$(gross)}</div>
    </div>
    <div class="an-hero-card" style="--hero-color:#34d399;border-top-left-radius:0;border-top-right-radius:0;">
      <div class="an-hero-label">Net Pay</div>
      <div class="an-hero-value">${f$(gross - t.total)}</div>
    </div>
    <div class="an-hero-card" style="--hero-color:var(--day);border-top-left-radius:0;border-top-right-radius:0;">
      <div class="an-hero-label">PP Hours</div>
      <div class="an-hero-value">${fatigueUsed.toFixed(1)}h</div>
      ${ppHoursMicro}
    </div>
  </div>
</div>`;

    const _sideHTML = `
<div class="analytics-wrap">

  <div class="an-flat-card">
    <div class="an-row"><span>Regular</span><strong>${fH(regH)}</strong></div>
    <div class="an-row"><span>OT</span><strong style="color:#34a853">${fH(ot)}</strong></div>
    <div class="an-row"><span>DT</span><strong style="color:#4285f4">${fH(dt)}</strong></div>
    <div class="an-sep"></div>
    <div class="an-row"><span>Aft / Night hrs</span><strong>${fH(aftH + nightH)}</strong></div>
    <div class="an-row"><span>Sat / Sun hrs</span><strong>${fH(satH + sunH)}</strong></div>
    <div class="an-sep"></div>
    <div class="an-row"><span>Tax (Fed + ON)</span><strong style="color:var(--night)">-${f$(t.fedTax + t.onTax)}</strong></div>
    <div class="an-row"><span>CPP + EI</span><strong style="color:var(--night)">-${f$(t.cpp + t.cpp2 + t.ei)}</strong></div>
  </div>

  <div class="an-month-block">
    <div class="an-section-title" style="margin-top:0">${months[displayMonth]} <span class="an-section-sub">${displayYear}</span></div>
    <div class="an-grid-3" style="margin-bottom:0">
      <div class="an-shift-card D"><div class="an-shift-label">Days</div><div class="an-shift-num">${dCount}</div></div>
      <div class="an-shift-card N"><div class="an-shift-label">Nights</div><div class="an-shift-num">${nCount}</div></div>
      <div class="an-shift-card O"><div class="an-shift-label">Off</div><div class="an-shift-num">${oCount}</div></div>
    </div>
  </div>

  <div class="an-flat-card">
    <div class="an-row"><span>Total Hours</span><strong>${fH(totalMonthHours)}</strong></div>
    ${monthOT > 0 ? `<div class="an-row"><span>OT</span><strong style="color:#34a853">${fH(monthOT)}</strong></div>` : ''}
    ${monthDT > 0 ? `<div class="an-row"><span>DT</span><strong style="color:#4285f4">${fH(monthDT)}</strong></div>` : ''}
    ${monthExRows ? `<div class="an-sep"></div>${monthExRows}` : ''}
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">${thisMonthName} vs ${prevMonthName}${prevYear !== displayYear ? ` <span class="an-section-sub" style="text-transform:none;letter-spacing:0">${prevYear}</span>` : ''}</div>
    <div class="an-compare-row an-compare-head">
      <span></span><span>${thisMonthName}</span><span>${prevMonthName}</span><span>Δ</span>
    </div>
    <div class="an-sep" style="margin:4px 0"></div>
    <div class="an-compare-row">
      <span>Days worked</span>
      <strong>${thisWorked}</strong>
      <strong style="color:var(--text-muted)">${prevWorked}</strong>
      <span class="an-delta ${thisWorked > prevWorked ? 'pos' : thisWorked < prevWorked ? 'neg' : ''}">${fDelta(thisWorked - prevWorked)}</span>
    </div>
    <div class="an-compare-row">
      <span>Hours</span>
      <strong>${totalMonthHours.toFixed(0)}</strong>
      <strong style="color:var(--text-muted)">${prevTotalHours.toFixed(0)}</strong>
      <span class="an-delta ${totalMonthHours > prevTotalHours ? 'pos' : totalMonthHours < prevTotalHours ? 'neg' : ''}">${fDelta(totalMonthHours - prevTotalHours)}</span>
    </div>
    ${(monthOT + monthDT > 0 || prevMonthOT + prevMonthDT > 0) ? `
    <div class="an-compare-row">
      <span>OT / DT hrs</span>
      <strong style="color:#34a853">${(monthOT + monthDT).toFixed(1)}</strong>
      <strong style="color:var(--text-muted)">${(prevMonthOT + prevMonthDT).toFixed(1)}</strong>
      <span class="an-delta ${(monthOT + monthDT) > (prevMonthOT + prevMonthDT) ? 'pos' : (monthOT + monthDT) < (prevMonthOT + prevMonthDT) ? 'neg' : ''}">${fDelta((monthOT + monthDT) - (prevMonthOT + prevMonthDT))}</span>
    </div>` : ''}
    ${(vacDays + absenceDays > 0 || prevVacDays + prevAbsDays > 0) ? `
    <div class="an-sep" style="margin:4px 0"></div>
    <div class="an-compare-row">
      <span>Days off taken</span>
      <strong style="color:#00bcd4">${vacDays + absenceDays}</strong>
      <strong style="color:var(--text-muted)">${prevVacDays + prevAbsDays}</strong>
      <span class="an-delta">${fDelta((vacDays + absenceDays) - (prevVacDays + prevAbsDays))}</span>
    </div>` : ''}
  </div>

</div>`;

    const _belowHTML = `
<div class="analytics-wrap">

  <div class="an-section-title">Vacation Balance</div>
  <div class="an-flat-card">
    <div class="an-row"><span>Used</span><strong style="color:#00bcd4">${fH(vacUsed)}</strong></div>
    <div class="an-row"><span>Remaining</span><strong>${fH(vacRem)}</strong></div>
    <div class="an-progress"><div class="an-progress-fill" style="width:${vacPct}%;background:${vacPct > 85 ? 'var(--night)' : '#00bcd4'}"></div></div>
    <div class="an-progress-meta">${vacPct}% used · ${vacStart} → ${vacEnd}</div>
  </div>

  <div class="an-section-title">Lieu &amp; Drop Day Balance</div>
  <div class="an-flat-card">
    <div class="an-row"><span>Banked Lieu Days</span><strong style="color:#fbbc04">${lieuBanked} day${lieuBanked !== 1 ? 's' : ''}</strong></div>
    ${lieuTaken > 0 ? `<div class="an-row"><span>Lieu Taken (${targetYear})</span><strong style="color:var(--text-muted)">${lieuTaken}d</strong></div>` : ''}
    <div class="an-sep"></div>
    <div class="an-row"><span>Drop Off Taken (${targetYear})</span><strong style="color:var(--day)">${dropOffTaken}d</strong></div>
    <div class="an-row"><span>Drop Paid Taken (${targetYear})</span><strong style="color:var(--off)">${dropPaidTaken}d</strong></div>
  </div>

  <div class="an-section-title">${targetYear} Year to Date</div>
  <div class="an-grid-2">
    <div class="an-hero-card" style="--hero-color:#f59e0b">
      <div class="an-hero-label">YTD Gross</div>
      <div class="an-hero-value">$${Math.round(ytdGross).toLocaleString()}</div>
    </div>
    <div class="an-hero-card" style="--hero-color:#8a8fa8">
      <div class="an-hero-label">Projected</div>
      <div class="an-hero-value">$${Math.round(projectedAnnual).toLocaleString()}</div>
    </div>
  </div>
  <div class="an-flat-card">
    <div class="an-flat-card-title">CPP / EI Progress</div>
    <div class="an-row"><span>CPP Paid</span><strong>${f$(ytdCPP)} / ${f$(annCPPMax)}</strong></div>
    <div class="an-progress" style="margin:4px 0 10px"><div class="an-progress-fill" style="width:${cppPct}%;background:#7c3aed"></div></div>
    <div class="an-row"><span>EI Paid</span><strong>${f$(ytdEI)} / ${f$(annEIMax)}</strong></div>
    <div class="an-progress" style="margin-top:4px"><div class="an-progress-fill" style="width:${eiPct}%;background:#4285f4"></div></div>
  </div>

</div>`;

    if (elSide)  elSide.innerHTML  = _sideHTML;
    if (elBelow) elBelow.innerHTML = _belowHTML;
}

// ── Long-press context menu ───────────────────────────────────────────────────
let _ctxLpTimer = null, _ctxLpX = 0, _ctxLpY = 0, _ctxLpFired = false;

function calLpStart(e, dStr, friendly, shift, next, view) {
    _ctxLpX = e.touches[0].clientX;
    _ctxLpY = e.touches[0].clientY;
    _ctxLpFired = false;
    _ctxLpTimer = setTimeout(() => {
        _ctxLpTimer = null;
        _ctxLpFired = true;
        showCtxMenu(dStr, friendly, shift, next, _ctxLpX, _ctxLpY, view);
    }, 500);
}

function calLpMove(e) {
    if (!_ctxLpTimer) return;
    const dx = e.touches[0].clientX - _ctxLpX;
    const dy = e.touches[0].clientY - _ctxLpY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(_ctxLpTimer); _ctxLpTimer = null; }
}

function calLpEnd(e) {
    if (_ctxLpTimer) { clearTimeout(_ctxLpTimer); _ctxLpTimer = null; }
    if (_ctxLpFired && e) e.preventDefault(); // block the synthetic click Android fires after long press
}

function calDayClick(dStr, friendly, shift, next) {
    if (_ctxLpFired) { _ctxLpFired = false; return; }
    haptic();
    openPickupSheet(dStr, friendly, shift, next);
}

function goToWeekPP(dStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    const dayUTC  = Date.UTC(y, m - 1, d);
    const lt      = getLogicalToday();
    const nowUTC  = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    currentWeekOffset = Math.floor((dayUTC - basePPStartUTC) / MS_PP) - Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    localStorage.setItem('currentWeekOffset', currentWeekOffset);
    setCalendarViewMode('week');
}

function clearDayMod(dStr) {
    if (!extraShifts[dStr]) return;
    const _undo = { ...extraShifts[dStr] };
    delete extraShifts[dStr];
    try {
        localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
    } catch(e) {
        showToast('Storage full — could not clear.', 'error');
        extraShifts[dStr] = _undo;
        return;
    }
    if (syncedEvents[dStr]) {
        delete syncedEvents[dStr];
        try { localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, JSON.stringify(syncedEvents)); } catch(e) {}
    }
    invalidateFatigueCache();
    updateNotifications();
    renderCalendar();
    showToastWithUndo('Day Reset', dStr, _undo);
}

function showCtxMenu(dStr, friendly, shift, next, x, y, view) {
    const menu = document.getElementById('ctx-menu');
    if (!menu) return;
    hideCtxMenu();
    let items = '';
    if (shift === 'O') {
        items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();openPickupSheet('${dStr}','${friendly}','D','${next}')">☀️ Day Shift</div>`;
        items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();openPickupSheet('${dStr}','${friendly}','N','${next}')">🌙 Night Shift</div>`;
    } else {
        const icon = shift === 'D' ? '☀️' : '🌙';
        items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();openPickupSheet('${dStr}','${friendly}','${shift}','${next}')">${icon} Log Shift</div>`;
    }
    items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();openPickupSheet('${dStr}','${friendly}','${shift}','${next}');requestAnimationFrame(()=>requestAnimationFrame(()=>selectType('Vacation')))">🏖️ Vacation</div>`;
    items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();triggerBiometricsAndOpenPay(Math.floor((Date.UTC(...'${dStr}'.split('-').map(Number).map((v,i)=>i===1?v-1:v))-basePPStartUTC)/MS_PP))">💰 View Pay Period</div>`;
    if (view === 'month') {
        items += `<div class="cal-ctx-item" onclick="hideCtxMenu();haptic();goToWeekPP('${dStr}')">📅 Go to Pay Period</div>`;
    }
    if (extraShifts[dStr]) {
        items += `<div style="height:1px;background:var(--border);margin:4px 8px"></div>`;
        items += `<div class="cal-ctx-item" onclick="hideCtxMenu();clearDayMod('${dStr}')">↩️ Clear Modifications</div>`;
    }
    menu.innerHTML = items;
    const menuW = 210;
    let top  = y - 220;
    let left = x - menuW / 2;
    if (top < 8)  top = y + 10;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    menu.style.top  = top  + 'px';
    menu.style.left = left + 'px';
    menu.style.display = 'block';
    haptic();
    requestAnimationFrame(() => menu.classList.add('visible'));
}

function hideCtxMenu() {
    const menu = document.getElementById('ctx-menu');
    if (!menu) return;
    menu.classList.remove('visible');
    setTimeout(() => { if (menu && !menu.classList.contains('visible')) menu.style.display = 'none'; }, 200);
}

document.addEventListener('touchstart', function(e) {
    const menu = document.getElementById('ctx-menu');
    if (menu && menu.style.display === 'block' && !e.target.closest('#ctx-menu')) {
        hideCtxMenu();
    }
}, { passive: true });
