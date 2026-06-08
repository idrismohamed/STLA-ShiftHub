/**
 * Return the position (0–27) of a UTC date in the 28-day rotation cycle.
 * @param {number} currUTC  UTC milliseconds for the date
 * @returns {number}
 */
function getPIndex(currUTC) {
    const refParts = savedRot.date.split('-');
    const refDate = new Date(Date.UTC(refParts[0], refParts[1] - 1, refParts[2]));
    return ((((Math.floor((currUTC - refDate.getTime()) / MS_DAY)) + (savedRot.offset || 0)) % 28) + 28) % 28;
}

/**
 * Return the scheduled shift ('D', 'N', or 'O') for a crew on a given pattern index.
 * Crew C inverts Day/Night relative to D. Crew B is offset 21 days. Crew A is both.
 * @param {number} basePIndex  result of getPIndex()
 * @param {string} crew        'A'|'B'|'C'|'D'
 * @returns {'D'|'N'|'O'}
 */
function getShiftForCrew(basePIndex, crew) {
    let effectiveIndex = basePIndex, invert = false;
    if (crew === 'C') invert = true;
    else if (crew === 'B') effectiveIndex = (basePIndex + 21) % 28;
    else if (crew === 'A') { effectiveIndex = (basePIndex + 21) % 28; invert = true; }
    let shift = PATTERN[effectiveIndex];
    if (invert) { if (shift === 'D') shift = 'N'; else if (shift === 'N') shift = 'D'; }
    return shift;
}

/**
 * Return "today" adjusted for night-shift workers: before 06:30 counts as the previous calendar day.
 * @returns {Date}  midnight-normalised local date
 */
function getLogicalToday() {
    let d = new Date();
    const crewSelector = document.getElementById('crew-select');
    const crew = crewSelector && crewSelector.value ? crewSelector.value : sysSettings.defaultCrew;

    const currentHour   = d.getHours();
    const currentMinute = d.getMinutes();

    if (currentHour < 6 || (currentHour === 6 && currentMinute < 30)) {
        const yesterday = new Date(d);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr  = toDateKey(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()));
        const yUTC  = Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        const yBase = getShiftForCrew(getPIndex(yUTC), crew);
        const yEx   = extraShifts[yStr];

        let isNight = false;
        if (yEx) {
            if (yEx.type === 'Night') isNight = true;
            else if (['Day', 'Off', 'DropOff', 'Vacation', 'DropPaid', 'Lieu'].includes(yEx.type)) isNight = false;
            else if (yBase === 'N') isNight = true;
        } else if (yBase === 'N') {
            isNight = true;
        }

        if (isNight) d.setDate(d.getDate() - 1);
    }
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Return the expected shift-end as a float hour for a given date/crew.
 * Returns null when the day is a lockout or the crew is off with no times set.
 * @param {string} dateStr  YYYY-MM-DD
 * @param {string} crew
 * @returns {number|null}
 */
function getShiftEndFloat(dateStr, crew) {
    if (dayFatigue[dateStr] && dayFatigue[dateStr].isLockout) return null;
    const s   = getShiftForCrew(getPIndex(Date.UTC(+dateStr.substring(0, 4), +dateStr.substring(5, 7) - 1, +dateStr.substring(8, 10))), crew);
    const ex  = extraShifts[dateStr];
    if (ex) {
        if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type) && !ex.startTime) return null;
        if (ex.endTime) {
            let endF = getFloatTime(ex.endTime);
            if (ex.startTime && endF < getFloatTime(ex.startTime)) endF += 24;
            return endF;
        }
    }
    if (s === 'D') return 18.5;
    if (s === 'N') return 30.5; // next-day 06:30 expressed as float past midnight
    return null;
}

/**
 * Return the expected shift-start as a float hour for a given date/crew.
 * Returns null when the day is a lockout or the crew is off with no times set.
 * @param {string} dateStr  YYYY-MM-DD
 * @param {string} crew
 * @returns {number|null}
 */
function getShiftStartFloat(dateStr, crew) {
    if (dayFatigue[dateStr] && dayFatigue[dateStr].isLockout) return null;
    const s  = getShiftForCrew(getPIndex(Date.UTC(+dateStr.substring(0, 4), +dateStr.substring(5, 7) - 1, +dateStr.substring(8, 10))), crew);
    const ex = extraShifts[dateStr];
    if (ex) {
        if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type) && !ex.startTime) return null;
        if (ex.startTime) return getFloatTime(ex.startTime);
    }
    if (s === 'D') return 6.5;
    if (s === 'N') return 18.5;
    return null;
}

let _fatigueKey = '';
/** Call before mutating extraShifts so the next precalcFatigue call recomputes. */
function invalidateFatigueCache() { _fatigueKey = ''; }

/**
 * Populate dayFatigue for all days in the given year (plus Dec of prior year and
 * Jan of following year) enforcing the 120-hour-per-14-day maximum.
 * Skips recomputation when called again with the same (year, crew) unless
 * invalidateFatigueCache() was called first.
 * @param {number} year
 * @param {string} viewCrew
 */
function precalcFatigue(year, viewCrew) {
    const key = `${year}-${viewCrew}`;
    if (key === _fatigueKey) return;
    _fatigueKey = key;
    dayFatigue = {};
    const yearStart = Date.UTC(year - 1, 11, 1);
    const yearEnd   = Date.UTC(year + 1, 0, 31);
    const sPP = Math.floor((yearStart - basePPStartUTC) / MS_PP);
    const ePP = Math.floor((yearEnd   - basePPStartUTC) / MS_PP);

    for (let i = sPP; i <= ePP; i++) {
        const ppStart = basePPStartUTC + i * MS_PP;
        const isD     = (((i % 3) + 3) % 3) === 1;

        // Pass 1: compute per-day hours for all 14 days and total PP hours
        const rawBaseH    = new Array(14);
        const rawExpected = new Array(14);
        let ppTotal = 0;

        for (let d = 0; d <= 13; d++) {
            const utc  = ppStart + d * MS_DAY;
            const dStr = toDateKey(utc);
            const bS   = getShiftForCrew(getPIndex(utc), viewCrew);
            const ex   = extraShifts[dStr];
            let baseH  = (bS === 'D' || bS === 'N') ? 12 : 0;

            if (ex && (ex.type === 'DropOff' || ex.type === 'DropPaid' || ex.type === 'Lieu')) baseH = 0;

            let expectedToday = baseH;
            if (ex) {
                if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) {
                    expectedToday = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0;
                } else if (ex.type === 'DropPaid') {
                    expectedToday = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12;
                } else if (ex.startTime && ex.endTime) {
                    expectedToday = getDuration(ex.startTime, ex.endTime);
                } else if (ex.type) {
                    expectedToday = 12;
                }
            }

            rawBaseH[d]    = baseH;
            rawExpected[d] = expectedToday;
            ppTotal       += expectedToday;
        }

        // Find the first day that can no longer be worked (sequential boundary)
        let running     = 0;
        let lockoutFrom = 14; // 14 = no lockout this PP
        for (let d = 0; d <= 13; d++) {
            if (running + rawExpected[d] > 120.01) { lockoutFrom = d; break; }
            running += rawExpected[d];
            if (running >= 120) { lockoutFrom = d + 1; break; }
        }

        // Pass 2: assign dayFatigue — lock post-boundary days AND off days in a full PP
        for (let d = 0; d <= 13; d++) {
            const utc  = ppStart + d * MS_DAY;
            const dStr = toDateKey(utc);
            const ex   = extraShifts[dStr];

            let lock = false;
            if (d >= lockoutFrom) {
                lock = true;                          // past the sequential 120h boundary
            } else if (ppTotal >= 120 && rawExpected[d] === 0) {
                lock = true;                          // off day in a PP already at full capacity
            }

            if (ex && ex.overrideLockout) lock = false;

            let baseH         = rawBaseH[d];
            let expectedToday = rawExpected[d];
            if (lock) { baseH = 0; expectedToday = 0; }

            dayFatigue[dStr] = {
                ppIndex:            i,
                ppDayIndex:         d,
                baseWorkHours:      baseH,
                scheduledWorkHours: expectedToday,
                isLockout:          lock,
                isDropPeriod:       isD,
                isPPBoundary:       (d === 13)
            };
        }
    }
}
