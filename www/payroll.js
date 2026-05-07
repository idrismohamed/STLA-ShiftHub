/**
 * Calculate shift premium pay (afternoon, night, Saturday, Sunday) in 30-min buckets.
 * Sunday premium is rate-dependent (10 % of rate) so rate must be passed in.
 * @param {string} dateStr   YYYY-MM-DD shift date
 * @param {string} startStr  "HH:MM" start time
 * @param {number} hours     number of worked hours to evaluate
 * @param {number} rate      hourly wage rate (used for Sunday premium)
 * @returns {{ total:number, aftHrs:number, nightHrs:number, satHrs:number, sunHrs:number }}
 */
function calcPremiums(dateStr, startStr, hours, rate) {
    if (hours <= 0) return { total: 0, aftHrs: 0, nightHrs: 0, satHrs: 0, sunHrs: 0 };
    const [y, m, d]    = dateStr.split('-').map(Number);
    const [hh, mm]     = startStr.split(':').map(Number);
    const startDow     = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const startMin     = hh * 60 + mm;
    const totalIters   = Math.round(hours * 2);
    let pT = 0, aft = 0, night = 0, sat = 0, sun = 0;

    for (let i = 0; i < totalIters; i++) {
        const cumMin   = startMin + i * 30;
        const dayOffset = Math.floor(cumMin / 1440);
        const wallH    = Math.floor((cumMin % 1440) / 60);
        const dow      = (startDow + dayOffset) % 7;
        let pR = 0;
        if (wallH >= 17 && wallH <= 23)     { pR += 0.90;          aft   += 0.5; }
        else if (wallH >= 0 && wallH < 7)   { pR += 0.95;          night += 0.5; }
        if (dow === 6)                       { pR += 1.00;          sat   += 0.5; }
        else if (dow === 0)                  { pR += (rate * 0.10); sun   += 0.5; }
        pT += (pR * 0.5);
    }
    return { total: pT, aftHrs: aft, nightHrs: night, satHrs: sat, sunHrs: sun };
}

/**
 * Count how many pay periods end in the given calendar year.
 * Normally 26; the function counts them explicitly to handle edge-case years.
 * @param {number} year
 * @returns {number}
 */
function getPayPeriodsInYear(year) {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd   = Date.UTC(year, 11, 31);
    const startIdx  = Math.floor((yearStart - basePPStartUTC) / MS_PP) - 1;
    const endIdx    = Math.floor((yearEnd   - basePPStartUTC) / MS_PP) + 1;
    let count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
        const ppE = basePPStartUTC + i * MS_PP + MS_PP_TO_END;
        if (new Date(ppE).getUTCFullYear() === year) count++;
    }
    return count > 0 ? count : 26;
}

/**
 * Calculate all payroll deductions for a bi-weekly gross amount.
 * Uses 2024–2026 federal/Ontario tax brackets, CPP, EI, and Ontario Health Premium.
 * @param {number} biGross      gross pay for this pay period
 * @param {number} ppI          pay period index (used to apply CPP/EI caps)
 * @param {number} [targetYear=2026]
 * @returns {{ cpp:number, ei:number, fedTax:number, onTax:number, total:number }}
 */
function calculateTaxes(biGross, ppI, targetYear = 2026) {
    const ppCount = getPayPeriodsInYear(targetYear);
    const annG    = biGross * ppCount;

    let fedBPA = 16452, onBPA = 12989;
    let annCPPMax = 4230.45, cppRate = 0.0595;
    let annEIMax  = 1123.07, eiRate  = 0.0163;

    if (targetYear === 2024) {
        fedBPA = 15705; onBPA = 12399; annCPPMax = 3867.50; annEIMax = 1049.12; eiRate = 0.0166;
    } else if (targetYear === 2025) {
        fedBPA = 16200; onBPA = 12700; annCPPMax = 4000.00; annEIMax = 1100.00; eiRate = 0.0164;
    }

    const cpp = (ppI < sysSettings.cppMaxPP) ? Math.max(0, biGross - (3500 / ppCount)) * cppRate : 0;
    const ei  = (ppI < sysSettings.eiMaxPP)  ? biGross * eiRate : 0;

    const annCPP = Math.min(cpp * ppCount, annCPPMax);
    const annEI  = Math.min(ei  * ppCount, annEIMax);
    const cea    = 1433; // Canada Employment Amount

    // BPA phase-out above $181 440 (2026 threshold)
    if (annG > 181440) {
        const excess = Math.min(annG - 181440, 258482 - 181440);
        fedBPA -= (excess / 77042) * (fedBPA - 14829);
    }

    // Federal tax
    let fedGross = 0;
    if      (annG <= 58523)  fedGross = annG * 0.14;
    else if (annG <= 117045) fedGross = 8193.22  + (annG - 58523)  * 0.205;
    else if (annG <= 181440) fedGross = 20190.23 + (annG - 117045) * 0.26;
    else if (annG <= 258482) fedGross = 36932.93 + (annG - 181440) * 0.29;
    else                     fedGross = 59275.11 + (annG - 258482) * 0.33;

    const fedCredits = (fedBPA + annCPP + annEI + cea) * 0.14;
    const fedT       = Math.max(0, fedGross - fedCredits);

    // Ontario tax
    let onGross = 0;
    if      (annG <= 53891)  onGross = annG * 0.0505;
    else if (annG <= 107785) onGross = 2721.50  + (annG - 53891)  * 0.0915;
    else if (annG <= 150000) onGross = 7652.80  + (annG - 107785) * 0.1116;
    else if (annG <= 220000) onGross = 12364.00 + (annG - 150000) * 0.1216;
    else                     onGross = 20876.00 + (annG - 220000) * 0.1316;

    const onCredits = (onBPA + annCPP + annEI) * 0.0505;
    let onT = Math.max(0, onGross - onCredits);

    // Ontario surtax
    if (onT > 5818) onT += (onT - 5818) * 0.20;
    if (onT > 7446) onT += (onT - 7446) * 0.36;

    // Ontario Health Premium
    let ohp = 0;
    if (annG > 20000) {
        if      (annG <= 36000)  ohp = Math.min(300, (annG - 20000)  * 0.06);
        else if (annG <= 48000)  ohp = Math.min(450,  300 + (annG - 36000)  * 0.06);
        else if (annG <= 72000)  ohp = Math.min(600,  450 + (annG - 48000)  * 0.25);
        else if (annG <= 200000) ohp = Math.min(750,  600 + (annG - 72000)  * 0.25);
        else                     ohp = Math.min(900,  750 + (annG - 200000) * 0.25);
    }
    onT += ohp;

    return { cpp, ei, fedTax: fedT / ppCount, onTax: onT / ppCount, total: cpp + ei + (fedT / ppCount) + (onT / ppCount) };
}

const _holsCache = {};

/**
 * Return a map of Ontario statutory holidays for the given year.
 * Easter is computed via the anonymous Gregorian algorithm.
 * Each entry: { n: "Holiday Name", m: multiplier } where m is 1.5 or 2.0.
 * @param {number} y
 * @returns {Object.<string,{n:string,m:number}>}
 */
function getHolidays(y) {
    y = parseInt(y);
    if (_holsCache[y]) return _holsCache[y];
    // Easter calculation (anonymous Gregorian algorithm)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d2 = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d2 - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, mn = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * mn + 114) / 31);
    const day   = ((h + l - 7 * mn + 114) % 31) + 1;
    const gf    = new Date(Date.UTC(y, month - 1, day) - 2 * MS_DAY); // Good Friday = Easter - 2

    const nthDay = (m, dow, n) => {
        const dt = new Date(Date.UTC(y, m, 1));
        let count = 0;
        while (dt.getUTCMonth() === m) {
            if (dt.getUTCDay() === dow) { count++; if (count === n) return dt; }
            dt.setUTCDate(dt.getUTCDate() + 1);
        }
        return null;
    };
    const lastMon = (m, date) => {
        const dt = new Date(Date.UTC(y, m, date - 1));
        while (dt.getUTCDay() !== 1) dt.setUTCDate(dt.getUTCDate() - 1);
        return dt;
    };
    const fmt = dt => toDateKey(dt.getTime());

    return (_holsCache[y] = {
        [fmt(new Date(Date.UTC(y, 0, 1)))]:  { n: "New Year's Day",  m: 1.5 },
        [fmt(nthDay(1, 1, 3))]:              { n: "Family Day",       m: 1.5 },
        [fmt(gf)]:                            { n: "Good Friday",      m: 1.5 },
        [fmt(lastMon(4, 25))]:               { n: "Victoria Day",     m: 1.5 },
        [fmt(new Date(Date.UTC(y, 6, 1)))]:  { n: "Canada Day",       m: 1.5 },
        [fmt(nthDay(7, 1, 1))]:              { n: "Civic Holiday",    m: 1.5 },
        [fmt(nthDay(8, 1, 1))]:              { n: "Labour Day",       m: 1.5 },
        [fmt(nthDay(9, 1, 2))]:              { n: "Thanksgiving",     m: 1.5 },
        [fmt(new Date(Date.UTC(y, 11, 24)))]:{ n: "Christmas Eve",    m: 1.5 },
        [fmt(new Date(Date.UTC(y, 11, 25)))]:{ n: "Christmas Day",    m: 2.0 },
        [fmt(new Date(Date.UTC(y, 11, 26)))]:{ n: "Boxing Day",       m: 2.0 }
    });
}

/**
 * Count banked lieu days available as of refDateStr.
 * A lieu day is earned when a statutory holiday falls on the crew's off day;
 * it expires 4 months after it was earned.
 * @param {string}      refDateStr     YYYY-MM-DD reference date
 * @param {string}      viewCrew
 * @param {string|null} excludeDateStr YYYY-MM-DD date to skip when counting taken days
 * @returns {number}  number of banked (unexpired) lieu days
 */
function computeLieuBalance(refDateStr, viewCrew, excludeDateStr) {
    const refY   = parseInt(refDateStr.substring(0, 4));
    const refM   = parseInt(refDateStr.substring(5, 7)) - 1;
    const refD   = parseInt(refDateStr.substring(8, 10));
    const refUTC = Date.UTC(refY, refM, refD);
    const yStart = Date.UTC(sysSettings.startYear, 0, 1);
    const cachedHols = {};

    const events = [];
    for (let u = yStart; u <= refUTC; u += MS_DAY) {
        const c    = new Date(u);
        const yr   = c.getUTCFullYear();
        if (!cachedHols[yr]) cachedHols[yr] = getHolidays(yr);
        const dS   = toDateKey(u);
        // Earn a lieu day when a holiday falls on an off-day
        if (cachedHols[yr][dS] && getShiftForCrew(getPIndex(u), viewCrew) === 'O') {
            events.push({ type: 'earn', utc: u, expires: addMonths(u, 4) });
        }
        // Consume a lieu day when one is taken
        if (extraShifts[dS] && extraShifts[dS].type === 'Lieu' && dS !== excludeDateStr) {
            events.push({ type: 'take', utc: u });
        }
    }
    events.sort((a, b) => a.utc - b.utc || (a.type === 'earn' ? -1 : 1));

    let bank = [];
    for (const ev of events) {
        bank = bank.filter(e => e.expires >= ev.utc);
        if (ev.type === 'earn') {
            bank.push({ expires: ev.expires });
        } else if (bank.length > 0) {
            bank.shift();
        }
    }
    bank = bank.filter(e => e.expires >= refUTC);
    return bank.length;
}

/**
 * Return the vacation cycle (start/end date strings) that contains targetDateStr.
 * Cycles roll year-over-year from the configured base start/end dates.
 * @param {string} targetDateStr  YYYY-MM-DD
 * @returns {{ start:string, end:string }}
 */
function getVacationCycle(targetDateStr) {
    const baseStart  = sysSettings.vacationStartDate || '2026-01-01';
    const baseEnd    = sysSettings.vacationEndDate   || '2026-12-31';
    const bYearStart = parseInt(baseStart.substring(0, 4));
    const bYearEnd   = parseInt(baseEnd.substring(0, 4));
    const tYear      = parseInt(targetDateStr.substring(0, 4));

    let offset    = tYear - bYearStart;
    let calcStart = (bYearStart + offset) + baseStart.substring(4);
    let calcEnd   = (bYearEnd   + offset) + baseEnd.substring(4);

    let maxIters = 5;
    while ((targetDateStr < calcStart || targetDateStr > calcEnd) && maxIters > 0) {
        if (targetDateStr < calcStart) offset--;
        else                           offset++;
        calcStart = (bYearStart + offset) + baseStart.substring(4);
        calcEnd   = (bYearEnd   + offset) + baseEnd.substring(4);
        maxIters--;
    }
    return { start: calcStart, end: calcEnd };
}

// ─── Payroll rendering and simulation ──────────────────────────────────────────

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
                if (ex?.regPay) {
                    // Off-day pickup classified as regular pay — holiday premiums still apply separately
                    regH += dayE;
                    const pDex = calcPremiums(dS, st, dayE, rate);
                    gross += (dayE * rate) + pDex.total;
                    aftH += pDex.aftHrs; nightH += pDex.nightHrs; satH += pDex.satHrs; sunH += pDex.sunHrs;
                } else {
                    let sO = ex?.otHours || 0, sD = ex?.dtHours || 0;
                    if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                    gross += (sO * rate * 1.5) + (sD * rate * 2.0);
                    ot += sO; dt += sD;
                }
            }
        }

        const holYear = parseInt(dS.substring(0, 4));
        if (!cachedHols[holYear]) cachedHols[holYear] = getHolidays(holYear);
        const holInfo = cachedHols[holYear][dS];
        if (holInfo) {
            statOffH += 8; gross += 8 * rate;
            // Night or day shift starting ON the holiday: full shift at premium
            if (dayR > 0) {
                if (holInfo.m === 2.0) { statWorked20H += dayR; gross += dayR * rate * 1.0; }
                else                  { statWorked15H += dayR; gross += dayR * rate * 0.5; }
            }
        }

        // Night shift starting the evening before a stat holiday: 10 hours at premium
        const nextDStr = toDateKey(u + MS_DAY);
        const nextHolYear = parseInt(nextDStr.substring(0, 4));
        if (!cachedHols[nextHolYear]) cachedHols[nextHolYear] = getHolidays(nextHolYear);
        const nextHolInfo = cachedHols[nextHolYear][nextDStr];
        if (nextHolInfo && dayR > 0 && (bS === 'N' || ex?.type === 'Night')) {
            const holPremH = Math.min(dayR, 10);
            if (nextHolInfo.m === 2.0) { statWorked20H += holPremH; gross += holPremH * rate * 1.0; }
            else                      { statWorked15H += holPremH; gross += holPremH * rate * 0.5; }
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
    const statOffHtml  = statOffH > 0      ? `<div class="pp-stat-row"><span>Holiday Pay:</span> <strong style="color: #fbbc04;">${statOffH.toFixed(1)} hrs</strong></div>` : '';
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

/**
 * Sum all vacation hours used within the vacation cycle that contains refDateStr.
 * @param {string}      viewCrew
 * @param {string}      refDateStr   YYYY-MM-DD
 * @param {string|null} excludeDate  YYYY-MM-DD day to exclude from the tally
 * @returns {number}
 */
function getUsedVacationHours(viewCrew, refDateStr, excludeDate = null) {
    if (!refDateStr) return 0;
    const { start, end } = getVacationCycle(refDateStr);
    let totalVac = 0;

    for (const [dS, ex] of Object.entries(extraShifts)) {
        if (dS < start || dS > end || dS === excludeDate) continue;
        if (ex.type === 'Vacation') {
            if (ex.vacHours !== undefined) {
                totalVac += ex.vacHours;
            } else if (ex.startTime && ex.endTime) {
                const pI = getPIndex(Date.UTC(+dS.substring(0, 4), +dS.substring(5, 7) - 1, +dS.substring(8, 10)));
                const bS = getShiftForCrew(pI, viewCrew);
                const bH = (bS === 'D' || bS === 'N') ? 12 : 0;
                totalVac += Math.max(0, bH - getDuration(ex.startTime, ex.endTime));
            } else {
                const pI = getPIndex(Date.UTC(+dS.substring(0, 4), +dS.substring(5, 7) - 1, +dS.substring(8, 10)));
                const bS = getShiftForCrew(pI, viewCrew);
                totalVac += (bS === 'D' || bS === 'N') ? 12 : 12;
            }
        } else if (ex.vacHours > 0) {
            totalVac += ex.vacHours;
        }
    }
    return totalVac;
}
