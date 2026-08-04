// ─── Analytics dashboard ──────────────────────────────────────────────────────
// Renders the analytics panel (side column on expanded displays, below the
// calendar otherwise). Extracted verbatim from calendar.js; chart primitives
// live in charts.js, pay math in payroll.js/payrollTools.js.

/** Render the four-section analytics dashboard below the calendar. */
let _anKey = '';
function renderAnalyticsDashboard(crew, logicalT) {
    const elSide  = document.getElementById('analytics-side');
    const elBelow = document.getElementById('analytics-below');
    if (!elSide && !elBelow) return;

    const nowUTC    = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const todayStr  = toDateKey(nowUTC);
    const currentPP    = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const displayPPIdx = calendarViewMode === 'week' ? currentPP + currentWeekOffset : currentPP;
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
    const ppSeries = [];   // per-pay-period series for the trend chart (Viz 1)

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
                else if (ex.type === 'Off' || ex.type === 'Lieu' || ex.type === 'OffDay')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
                else if (ex.startTime && ex.endTime)               { act = getDuration(ex.startTime, ex.endTime); }
                else if (ex.type)                                  { act = 12; }
            }
            // 2nd shift hours
            const _s2 = ex?.shift2;
            const _s2dur = (_s2 && _s2.startTime && _s2.endTime) ? getDuration(_s2.startTime, _s2.endTime) : 0;
            act += _s2dur;

            if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu' && ex?.type !== 'OffDay') act = 0;

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
                    let sO = (ex?.otHours || 0) + (_s2?.otHours || 0);
                    let sD = (ex?.dtHours || 0) + (_s2?.dtHours || 0);
                    if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                    piGross += (sO * rate * 1.5) + (sD * rate * 2.0);
                    piOT += sO; piDT += sD;
                    // 2nd shift premium differentials
                    if (_s2dur > 0 && _s2.startTime) {
                        const pD2 = calcPremiums(dS, _s2.startTime, _s2dur, rate);
                        piGross += pD2.total;
                        piAft += pD2.aftHrs; piNight += pD2.nightHrs; piSat += pD2.satHrs; piSun += pD2.sunHrs;
                    }
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

        ppSeries.push({
            gross:  piGross,
            hours:  piRegH + piOT + piDT,
            ot:     piOT + piDT,
            regH:   piRegH,
            otH:    piOT,
            dtH:    piDT,
            aftH:   piAft,
            nightH: piNight,
            satH:   piSat,
            sunH:   piSun,
            label:  new Date(s).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
        });

        if (pi === currentPP) {
            gross = piGross; regH = piRegH; ot = piOT; dt = piDT;
            aftH = piAft; nightH = piNight; satH = piSat; sunH = piSun;
        }
    }

    // Fold in manually-logged bonus / VCP payments for the year so YTD gross and
    // the CPP/EI cap rings reflect them too.
    if (typeof extraPaymentsYTD === 'function') {
        const _xp = extraPaymentsYTD(targetYear);
        ytdGross += _xp.gross; ytdCPP += _xp.cpp; ytdEI += _xp.ei;
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
            else if (ex.type === 'OffDay')   {                hours = 0; eff = 'O'; }
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
            else if (ex2.type === 'OffDay')   {                hours2 = 0; eff2 = 'O'; }
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
    const k$  = n => '$' + (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : Math.round(n));

    // Last 8 pay periods for the trend chart (label every other PP to avoid clutter)
    const trendSlice  = ppSeries.slice(-8);
    const trendSeries = {
        labels: trendSlice.map((p, i) => (i % 2 === 0 || i === trendSlice.length - 1) ? p.label : ''),
        gross:  trendSlice.map(p => p.gross),
        hours:  trendSlice.map(p => p.hours),
        ot:     trendSlice.map(p => p.ot)
    };

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

    // ── Breakdown data for the viewed PP (dynamic in week view) ─────────────────
    const brkPPS        = basePPStartUTC + displayPPIdx * MS_PP;
    const brkPPE        = brkPPS + MS_PP_TO_END;
    const brkStartLabel = new Date(brkPPS).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const brkEndLabel   = new Date(brkPPE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const brkIsOtherPP  = calendarViewMode === 'week' && displayPPIdx !== currentPP;
    let brkRegH, brkOT, brkDT, brkAftH, brkNightH, brkSatH, brkSunH, brkGross;
    const brkSeriesIdx = displayPPIdx - firstPP;
    if (brkSeriesIdx >= 0 && brkSeriesIdx < ppSeries.length) {
        const p = ppSeries[brkSeriesIdx];
        brkRegH = p.regH; brkOT = p.otH; brkDT = p.dtH;
        brkAftH = p.aftH; brkNightH = p.nightH; brkSatH = p.satH; brkSunH = p.sunH;
        brkGross = p.gross;
    } else {
        brkRegH = 0; brkOT = 0; brkDT = 0; brkAftH = 0; brkNightH = 0; brkSatH = 0; brkSunH = 0; brkGross = 0;
        for (let d = 0; d <= 13; d++) {
            const u   = brkPPS + d * MS_DAY;
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
                else if (ex.type === 'Off' || ex.type === 'Lieu' || ex.type === 'OffDay')  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
                else if (ex.startTime && ex.endTime)               { act = getDuration(ex.startTime, ex.endTime); }
                else if (ex.type)                                  { act = 12; }
            }
            const _bs2 = ex?.shift2;
            const _bs2dur = (_bs2 && _bs2.startTime && _bs2.endTime) ? getDuration(_bs2.startTime, _bs2.endTime) : 0;
            act += _bs2dur;
            if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu' && ex?.type !== 'OffDay') act = 0;
            const dayR = Math.min(act, bH);
            const dayE = Math.max(0, act - bH);
            let rate = sysSettings.regRate;
            if (ex?.role === 'TL')                            rate = sysSettings.tlRate;
            else if (ex?.role === 'Manual' && ex?.manualRate) rate = ex.manualRate;
            brkRegH += dayR;
            if (isVac) {
                const vH = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? Math.max(0, bH - act) : (bH || 12));
                brkGross += vH * rate;
            }
            if (!f.isLockout && act > 0) {
                const pD = calcPremiums(dS, st, dayR, rate);
                brkGross += (dayR * rate) + pD.total;
                brkAftH  += pD.aftHrs; brkNightH += pD.nightHrs; brkSatH += pD.satHrs; brkSunH += pD.sunHrs;
                if (dayE > 0) {
                    let sO = (ex?.otHours || 0) + (_bs2?.otHours || 0);
                    let sD = (ex?.dtHours || 0) + (_bs2?.dtHours || 0);
                    if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                    brkGross += (sO * rate * 1.5) + (sD * rate * 2.0);
                    brkOT += sO; brkDT += sD;
                    if (_bs2dur > 0 && _bs2.startTime) {
                        const pD2b = calcPremiums(dS, _bs2.startTime, _bs2dur, rate);
                        brkGross += pD2b.total;
                        brkAftH += pD2b.aftHrs; brkNightH += pD2b.nightHrs; brkSatH += pD2b.satHrs; brkSunH += pD2b.sunHrs;
                    }
                }
            }
            const holYear = parseInt(dS.substring(0, 4));
            const holInfo = getHols(holYear)[dS];
            if (holInfo) {
                brkGross += 8 * rate;
                if (dayR > 0) brkGross += dayR * rate * (holInfo.m === 2.0 ? 1.0 : 0.5);
            }
            const nextDStr    = toDateKey(u + MS_DAY);
            const nextHolInfo = getHols(parseInt(nextDStr.substring(0, 4)))[nextDStr];
            if (nextHolInfo && dayR > 0 && (bS === 'N' || ex?.type === 'Night')) {
                brkGross += Math.min(dayR, 10) * rate * (nextHolInfo.m === 2.0 ? 1.0 : 0.5);
            }
        }
    }
    const brkT = calculateTaxes(brkGross, displayPPIdx, targetYear);

    // ── Display values for the full top card (viewed PP in week view, else current PP) ─
    const isWeekView     = calendarViewMode === 'week';
    const isPastPP       = isWeekView && displayPPIdx < currentPP;
    const isFuturePP     = isWeekView && displayPPIdx > currentPP;
    const dispGross      = isWeekView ? brkGross : gross;
    const dispT          = isWeekView ? brkT     : t;
    const dispOT         = isWeekView ? brkOT    : ot;
    const dispDT         = isWeekView ? brkDT    : dt;
    const dispFatigueUsed  = isWeekView ? brkRegH + brkOT + brkDT : fatigueUsed;
    const dispFatigueRem   = Math.max(0, 120 - dispFatigueUsed);
    const dispFatigueColor = dispFatigueUsed >= 108 ? 'var(--night)' : dispFatigueUsed >= 90 ? 'var(--accent)' : '#34d399';
    const dispFatigueAtMax = dispFatigueUsed >= 120;
    const dispHoursMicro   = (dispOT + dispDT > 0) ? `<div class="an-hero-micro">+${(dispOT + dispDT).toFixed(1)}h OT/DT</div>` : '';
    let dispPpDayIndex;
    if (!isWeekView || displayPPIdx === currentPP) { dispPpDayIndex = ppDayIndex; }
    else if (isPastPP)   { dispPpDayIndex = 13; }
    else                 { dispPpDayIndex = -1; }
    const dispPpDayDisplay = dispPpDayIndex + 1;
    const dispPpDaysLeft   = 14 - dispPpDayDisplay;
    const dispPpPct        = Math.round((dispPpDayDisplay / 14) * 100);
    const topCardTitle     = (!isWeekView || displayPPIdx === currentPP) ? 'Current Pay Period'
                           : isFuturePP ? 'Upcoming Pay Period' : 'Pay Period';
    const pastBadge        = isPastPP ? '<span class="pp-past-badge">Past</span>' : '';

    // ── Year-over-year, OT-by-month and rest/recovery stats ──────────────────
    // Logged OT/DT hours inside a YYYY-MM-DD key range.
    const sumLoggedOT = (fromKey, toKey) => {
        let s = 0;
        for (const [dS, ex] of Object.entries(extraShifts)) {
            if (dS < fromKey || dS > toKey) continue;
            s += (ex.otHours || 0) + (ex.dtHours || 0) + (ex.shift2?.otHours || 0) + (ex.shift2?.dtHours || 0);
        }
        return s;
    };

    // This year vs last year over the same number of elapsed pay periods.
    const lyYear = targetYear - 1;
    let lyGross = 0, lyHours = 0, thisHours = 0;
    {
        let lyFirst = firstPP - 1;
        while (lyFirst > 0) {
            const e = basePPStartUTC + (lyFirst - 1) * MS_PP + MS_PP_TO_END;
            if (new Date(e).getUTCFullYear() < lyYear) break;
            lyFirst--;
        }
        precalcFatigue(lyYear, crew);
        for (let k = 0; k < ppsDone; k++) {
            lyGross += computePPGross(lyFirst + k, crew, lyYear);
            const s2 = basePPStartUTC + (lyFirst + k) * MS_PP;
            for (let d = 0; d <= 13; d++) { const ff = dayFatigue[toDateKey(s2 + d * MS_DAY)]; if (ff) lyHours += ff.scheduledWorkHours; }
        }
        precalcFatigue(targetYear, crew);   // restore fatigue state for the displayed year
        for (let pi2 = firstPP; pi2 <= currentPP; pi2++) {
            const s2 = basePPStartUTC + pi2 * MS_PP;
            for (let d = 0; d <= 13; d++) { const ff = dayFatigue[toDateKey(s2 + d * MS_DAY)]; if (ff) thisHours += ff.scheduledWorkHours; }
        }
    }
    const thisYearOT = sumLoggedOT(`${targetYear}-01-01`, todayStr);
    const lyOT       = sumLoggedOT(`${lyYear}-01-01`, `${lyYear}-${todayStr.substring(5)}`);

    // Logged OT/DT per month of the displayed year.
    const otByMonth = [];
    for (let m = 0; m < 12; m++) {
        const mm = String(m + 1).padStart(2, '0');
        otByMonth.push(sumLoggedOT(`${targetYear}-${mm}-01`, `${targetYear}-${mm}-31`));
    }

    // Rest between consecutive shifts over the past 8 weeks (gaps > 72h = days
    // off, excluded from the turnaround average).
    const restGaps = [];
    let shortTurnarounds = 0;
    {
        let prevEndAbs = null;
        for (let i = -56; i <= 0; i++) {
            const dS = toDateKey(nowUTC + i * MS_DAY);
            const sF = getShiftStartFloat(dS, crew);
            const eF = getShiftEndFloat(dS, crew);
            if (sF === null || eF === null) continue;
            const startAbs = i * 24 + sF;
            if (prevEndAbs !== null) {
                const gap = startAbs - prevEndAbs;
                if (gap >= 0 && gap <= 72) { restGaps.push(gap); if (gap < 12) shortTurnarounds++; }
            }
            prevEndAbs = i * 24 + eF;
        }
    }
    const avgRest = restGaps.length ? restGaps.reduce((a, b) => a + b, 0) / restGaps.length : 0;

    const _newKey = `${crew}|${currentPP}|${ppDayIndex}|${displayMonth}|${displayYear}|${Math.round(gross)}|${Math.round(ytdGross)}|${dCount}|${nCount}|${Math.round(fatigueUsed)}|${Math.round(vacUsed)}|${lieuBanked}|${displayPPIdx}|${Math.round(brkGross)}|${Math.round(lyGross)}|${Math.round(thisYearOT)}`;
    if (_newKey === _anKey) return;
    _anKey = _newKey;

    const elTop = document.getElementById('pp-top-summary');
    if (elTop) elTop.innerHTML = `
<div class="pp-top-wrap">
  <div class="pp-top-tap" onclick="haptic(); openPayrollSheet(${displayPPIdx})" role="button" tabindex="0">
  <div class="an-flat-card">
    <div class="an-flat-card-title">${topCardTitle} ${pastBadge}<span class="an-section-sub" style="text-transform:none;letter-spacing:0;font-size:10px">${brkStartLabel}–${brkEndLabel}</span><span class="pp-top-chev">›</span></div>
    <div class="an-pp-bar-labels"><span>Day ${dispPpDayDisplay} of 14</span><span>${isPastPP ? 'Complete' : isFuturePP ? 'Not started' : `${dispPpDaysLeft} day${dispPpDaysLeft !== 1 ? 's' : ''} left`}</span></div>
    <div style="margin:5px 0 0">${typeof wavyProgressHTML === 'function' ? wavyProgressHTML(dispPpPct) : `<div class="an-progress"><div class="an-progress-fill" style="width:${dispPpPct}%;background:var(--accent)"></div></div>`}</div>
  </div>
  <div class="an-grid-3">
    <div class="an-hero-card" style="--hero-color:#7c3aed">
      <div class="an-hero-label">Gross</div>
      <div class="an-hero-value">${f$(dispGross)}</div>
    </div>
    <div class="an-hero-card" style="--hero-color:#34d399">
      <div class="an-hero-label">Net Pay</div>
      <div class="an-hero-value">${f$(dispGross - dispT.total)}</div>
    </div>
    <div class="an-hero-card" style="--hero-color:var(--day)">
      <div class="an-hero-label">PP Hours</div>
      <div class="an-hero-value">${dispFatigueUsed.toFixed(1)}h</div>
      ${dispHoursMicro}
    </div>
  </div>
  </div>
  <div class="pp-bars-section">
    <div class="ch-sub-label">Where Your Pay Goes <span class="ch-sub-val">Net ${f$(dispGross - dispT.total)}</span></div>
    <div id="chart-paybar" class="ch-host-bar"></div>
    <div class="ch-legend" id="chart-paybar-legend"></div>
    <div class="an-sep" style="margin:12px 0 10px"></div>
    <div class="ch-sub-label">120H Limit${dispFatigueAtMax ? ` · ${icon('ban', 11)} MAX` : ''} <span class="ch-sub-val" style="color:${dispFatigueColor}">${dispFatigueAtMax ? 'Limit reached' : dispFatigueRem.toFixed(1) + 'h left'}</span></div>
    <div id="chart-fatigue-bar" class="ch-host-bar"></div>
    <div class="ch-legend" id="chart-fatigue-legend"></div>
  </div>
  <div class="pp-breakdown-section">
    <div class="an-flat-card-title">Pay Period Breakdown</div>
    <div class="an-row"><span>Regular</span><strong>${fH(brkRegH)}</strong></div>
    <div class="an-row"><span>OT</span><strong style="color:#34a853">${fH(brkOT)}</strong></div>
    <div class="an-row"><span>DT</span><strong style="color:#4285f4">${fH(brkDT)}</strong></div>
    <div class="an-sep"></div>
    <div class="an-row"><span>Aft / Night hrs</span><strong>${fH(brkAftH + brkNightH)}</strong></div>
    <div class="an-row"><span>Sat / Sun hrs</span><strong>${fH(brkSatH + brkSunH)}</strong></div>
    <div class="an-sep"></div>
    <div class="an-row"><span>Tax (Fed + ON)</span><strong style="color:var(--night)">-${f$(brkT.fedTax + brkT.onTax)}</strong></div>
    <div class="an-row"><span>CPP + EI</span><strong style="color:var(--night)">-${f$(brkT.cpp + brkT.cpp2 + brkT.ei)}</strong></div>
  </div>
</div>`;

    const _sideHTML = `
<div class="analytics-wrap">

  <div class="an-flat-card">
    <div class="an-flat-card-title">${thisMonthName} vs ${prevMonthName}${prevYear !== displayYear ? ` <span class="an-section-sub" style="text-transform:none;letter-spacing:0">${prevYear}</span>` : ''}</div>
    <div id="chart-paired"></div>
  </div>

</div>`;

    const _belowHTML = `
<div class="analytics-wrap">

  <div class="an-flat-card">
    <div class="an-flat-card-title">CPP &amp; EI Caps <span class="an-section-sub" style="text-transform:none;letter-spacing:0">${targetYear}</span></div>
    <div id="chart-rings" class="ch-rings"></div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">Pay Trend <span class="an-section-sub" style="text-transform:none;letter-spacing:0">last ${trendSlice.length} pay period${trendSlice.length !== 1 ? 's' : ''}</span></div>
    <div class="ch-seg" id="trend-seg">
      <button class="active" onclick="chartTrendSwitch(this,'gross')">Gross</button>
      <button onclick="chartTrendSwitch(this,'hours')">Hours</button>
      <button onclick="chartTrendSwitch(this,'ot')">OT/DT</button>
    </div>
    <div id="chart-trend" class="ch-host"></div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">Year to Date <span class="an-section-sub" style="text-transform:none;letter-spacing:0">${targetYear}</span></div>
    <div class="an-grid-2 ytd-hero-grid">
      <div class="an-hero-card" style="--hero-color:#f59e0b">
        <div class="an-hero-label">YTD Gross</div>
        <div class="an-hero-value">$${Math.round(ytdGross).toLocaleString()}</div>
      </div>
      <div class="an-hero-card" style="--hero-color:#8a8fa8">
        <div class="an-hero-label">Projected</div>
        <div class="an-hero-value">$${Math.round(projectedAnnual).toLocaleString()}</div>
      </div>
    </div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">${targetYear} vs ${lyYear} <span class="an-section-sub" style="text-transform:none;letter-spacing:0">same ${ppsDone} pay period${ppsDone !== 1 ? 's' : ''}</span></div>
    <div id="chart-yoy"></div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">OT by Month <span class="an-section-sub" style="text-transform:none;letter-spacing:0">${targetYear} · logged OT/DT</span></div>
    <div id="chart-otmonth" class="ch-host-bar"></div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">Rest &amp; Recovery <span class="an-section-sub" style="text-transform:none;letter-spacing:0">last 8 weeks</span></div>
    <div class="an-grid-2">
      <div class="an-hero-card" style="--hero-color:#34d399">
        <div class="an-hero-label">Avg Turnaround</div>
        <div class="an-hero-value">${avgRest.toFixed(1)}h</div>
      </div>
      <div class="an-hero-card" style="--hero-color:${shortTurnarounds > 0 ? 'var(--night)' : '#8a8fa8'}">
        <div class="an-hero-label">Short Rests</div>
        <div class="an-hero-value">${shortTurnarounds}</div>
        <div class="an-hero-micro">&lt;12h between shifts</div>
      </div>
    </div>
  </div>

  <div class="an-flat-card">
    <div class="an-flat-card-title">Time Off <span class="an-section-sub" style="text-transform:none;letter-spacing:0">tap a ring for details</span></div>
    <div id="chart-timeoff" class="ch-rings"></div>
    <div class="an-progress-meta">Vacation ${vacPct}% used · ${vacStart} → ${vacEnd}</div>
  </div>

</div>`;

    if (elSide)  elSide.innerHTML  = _sideHTML;
    if (elBelow) elBelow.innerHTML = _belowHTML;
    // Stagger index for the card entrance animation (CSS reads --an-i).
    document.querySelectorAll('.analytics-wrap .an-flat-card').forEach((c, i) => c.style.setProperty('--an-i', i));
    animateHeroCountUps();

    // ── Inline-SVG analytics charts (charts.js) ──────────────
    if (typeof chartStacked === 'function') {
        chartStacked('chart-paybar', 'chart-paybar-legend', [
            ['Net',     dispGross - dispT.total, '--c-net'],
            ['Fed Tax', dispT.fedTax,            '--c-tax'],
            ['ON Tax',  dispT.onTax,             '--c-cpp'],
            ['CPP',     dispT.cpp + dispT.cpp2,  '--c-ot'],
            ['EI',      dispT.ei,                '--c-ei']
        ]);
        const fatigueTrackColor = dispFatigueUsed >= 108 ? '--c-dt' : dispFatigueUsed >= 90 ? '--warn' : '--c-reg';
        chartStacked('chart-fatigue-bar', 'chart-fatigue-legend', [
            ['Used', dispFatigueUsed, fatigueTrackColor],
            ['Left', Math.max(0, 120 - dispFatigueUsed), '--m3-surface-container-highest']
        ], v => v.toFixed(1) + 'h');
        chartPaired('chart-paired', [
            ['Days worked', thisWorked, prevWorked],
            ['Hours', Math.round(totalMonthHours), Math.round(prevTotalHours)],
            ['OT/DT hrs', Math.round((monthOT + monthDT) * 10) / 10, Math.round((prevMonthOT + prevMonthDT) * 10) / 10]
        ], thisMonthName, prevMonthName);
        chartRings('chart-rings', [
            ['CPP', `${k$(ytdCPP)} / ${k$(annCPPMax)}`, annCPPMax ? ytdCPP / annCPPMax : 0, '--c-cpp'],
            ['EI',  `${k$(ytdEI)} / ${k$(annEIMax)}`,   annEIMax  ? ytdEI / annEIMax   : 0, '--c-ei']
        ]);
        // Time-off rings — separate from the contribution caps, and each is
        // tappable to list when/where that allowance was used.
        const lieuEarned = lieuTaken + lieuBanked;
        const dropTotal  = dropOffTaken + dropPaidTaken;
        chartRings('chart-timeoff', [
            ['Vacation', `${Math.round(vacRem)}h left`, vacLimit ? vacUsed / vacLimit : 0, '#00bcd4'],
            ['Holiday',  `${lieuBanked} banked`,        lieuEarned ? lieuTaken / lieuEarned : 0, '#fbbc04'],
            ['Drop',     `${dropTotal} used`,           dropTotal ? dropPaidTaken / dropTotal : 0, '--c-net']
        ]);
        const _toHost = document.getElementById('chart-timeoff');
        if (_toHost) {
            const _types = ['vacation', 'lieu', 'drop'];
            _toHost.querySelectorAll('.ch-ring-cap').forEach((c, i) => {
                c.style.cursor = 'pointer';
                c.onclick = () => openTimeOffDetail(_types[i]);
            });
        }
        chartTrend(trendSeries);
        chartPaired('chart-yoy', [
            ['Gross $k',  Math.round(ytdGross / 100) / 10, Math.round(lyGross / 100) / 10],
            ['Worked hrs', Math.round(thisHours), Math.round(lyHours)],
            ['OT/DT hrs',  Math.round(thisYearOT * 10) / 10, Math.round(lyOT * 10) / 10]
        ], String(targetYear), String(lyYear));
        chartBars('chart-otmonth',
            otByMonth.map((v, m) => [months[m].substring(0, 3), Math.round(v * 10) / 10, '--c-ot']), 'h');
    }
}

/**
 * List when/where a time-off allowance (vacation / lieu / drop) has been used,
 * in a detail sheet. Triggered by tapping a Time Off ring on the dashboard.
 * @param {'vacation'|'lieu'|'drop'} type
 */
function openTimeOffDetail(type) {
    haptic();
    const crew = (document.getElementById('crew-select') || {}).value || sysSettings.defaultCrew;
    const meta = {
        vacation: { title: `${icon('umbrella', 14)} Vacation Days`,     unit: 'h' },
        lieu:     { title: `${icon('landmark', 14)} Lieu (Holiday) Days`, unit: 'd' },
        drop:     { title: `${icon('droplet', 14)} Drop Days`,           unit: 'd' }
    }[type] || { title: 'Time Off', unit: '' };

    const match = ex =>
        type === 'vacation' ? (ex.type === 'Vacation' || (ex.vacHours > 0 && ex.type !== 'Off')) :
        type === 'lieu'     ? ex.type === 'Lieu' :
        type === 'drop'     ? (ex.type === 'DropOff' || ex.type === 'DropPaid') : false;

    const days = Object.keys(extraShifts).filter(d => match(extraShifts[d])).sort().reverse();
    const titleEl = document.getElementById('timeoff-detail-title');
    const host    = document.getElementById('timeoff-detail-content');
    // meta.title carries an inline <svg> icon, so it must be assigned as HTML.
    if (titleEl) titleEl.innerHTML = meta.title;
    if (!host) return;

    if (!days.length) {
        host.innerHTML = `<div class="vf-hint">None logged yet.</div>`;
        openSheet('sheet-timeoff-detail');
        return;
    }

    let total = 0;
    host.innerHTML = days.map(d => {
        const ex   = extraShifts[d];
        const u    = Date.UTC(+d.substring(0, 4), +d.substring(5, 7) - 1, +d.substring(8, 10));
        const base = getShiftForCrew(getPIndex(u), crew);
        const baseLabel = base === 'D' ? 'Day shift' : base === 'N' ? 'Night shift' : 'Off day';
        const when = new Date(u).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        let detail;
        if (type === 'vacation') {
            const h = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? getDuration(ex.startTime, ex.endTime) : 12);
            total += h; detail = `${h}h`;
        } else if (type === 'drop') {
            total += 1; detail = ex.type === 'DropPaid' ? 'Paid' : 'Unpaid';
        } else {
            total += 1; detail = '1 day';
        }
        return `<div class="to-row"><div class="to-when">${when}<span class="to-where">covers your ${baseLabel}</span></div><div class="to-detail">${detail}</div></div>`;
    }).join('') +
    `<div class="cap-foot">${days.length} entr${days.length === 1 ? 'y' : 'ies'} · total ${meta.unit === 'h' ? total + 'h' : total + ' day' + (total !== 1 ? 's' : '')}</div>`;

    openSheet('sheet-timeoff-detail');
}

// ── Count-up animation for hero pay figures ───────────────────────────────────
const _cuCache = {};
function _parseFigure(txt) {
    const m = txt.match(/[-+]?[\d,]*\.?\d+/);
    if (!m) return null;
    const numStr   = m[0];
    const start    = txt.indexOf(numStr);
    const dot      = numStr.indexOf('.');
    return {
        prefix:   txt.slice(0, start),
        suffix:   txt.slice(start + numStr.length),
        value:    parseFloat(numStr.replace(/,/g, '')),
        decimals: dot >= 0 ? numStr.length - dot - 1 : 0,
        hasComma: numStr.includes(',')
    };
}
function _fmtFigure(v, info) {
    const s = info.hasComma
        ? v.toLocaleString('en-US', { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals })
        : v.toFixed(info.decimals);
    return info.prefix + s + info.suffix;
}
/** Animate every .an-hero-value: from 0 on first sight, from prev when it changes,
 *  untouched when unchanged (so plain navigation doesn't re-trigger it). */
function animateHeroCountUps() {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll(
        '#pp-top-summary .an-hero-value, #analytics-side .an-hero-value, #analytics-below .an-hero-value'
    );
    els.forEach((el, i) => {
        const info = _parseFigure(el.textContent);
        if (!info) return;
        const label  = el.previousElementSibling ? el.previousElementSibling.textContent : '';
        const key    = (el.closest('[id]') ? el.closest('[id]').id : 'x') + ':' + i + ':' + label;
        const target = info.value;
        const prev   = _cuCache[key];
        _cuCache[key] = target;

        if (el._cuRAF) { cancelAnimationFrame(el._cuRAF); el._cuRAF = null; }
        if (reduce || prev === target || !window.requestAnimationFrame) return; // already correct / no motion

        const from = (prev === undefined) ? 0 : prev;
        const dur  = 700, t0 = performance.now();
        el.textContent = _fmtFigure(from, info);
        const step = now => {
            const p = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
            el.textContent = _fmtFigure(from + (target - from) * e, info);
            if (p < 1) el._cuRAF = requestAnimationFrame(step);
            else { el._cuRAF = null; el.textContent = _fmtFigure(target, info); }
        };
        el._cuRAF = requestAnimationFrame(step);
    });
}
