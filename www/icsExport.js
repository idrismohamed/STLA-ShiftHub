// ─── ICS calendar export ──────────────────────────────────────────────────────
// Generates a standard iCalendar (.ics) file of the next 12 months of shifts so
// family can see the schedule in their own calendar app — no Shift Hub needed.
// Day resolution reuses resolveDaySchedule() (notifications.js): overrides,
// rotation and fatigue lockouts all reflected. Working days become timed
// events; vacations become all-day events; plain off days are skipped.

/** Escape a text value per RFC 5545. */
function _icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** "YYYY-MM-DD" + "HH:MM" (+ offset hours) → floating local ICS datetime. */
function _icsDateTime(dStr, timeStr, addHours = 0) {
    const [y, m, d]  = dStr.split('-').map(Number);
    const [hh, mm]   = timeStr.split(':').map(Number);
    const t = new Date(y, m - 1, d, hh, mm, 0);
    if (addHours) t.setTime(t.getTime() + addHours * 3600000);
    const p = n => String(n).padStart(2, '0');
    return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}T${p(t.getHours())}${p(t.getMinutes())}00`;
}

/** "YYYY-MM-DD" (+ offset days) → ICS date. */
function _icsDate(dStr, addDays = 0) {
    const [y, m, d] = dStr.split('-').map(Number);
    const t = new Date(y, m - 1, d + addDays);
    const p = n => String(n).padStart(2, '0');
    return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}`;
}

/**
 * Build the VCALENDAR string for a crew over [fromUTC, toUTC].
 * @param {string} crew
 * @param {number} fromUTC  UTC ms, midnight
 * @param {number} toUTC    UTC ms, midnight (inclusive)
 * @returns {string}
 */
function buildICS(crew, fromUTC, toUTC) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//STLA Shift Hub//Shift Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Shift Hub — Crew ${crew}`
    ];
    const stamp = _icsDateTime(toDateKey(Date.now()), '00:00');

    let lastYear = 0;
    for (let u = fromUTC; u <= toUTC; u += MS_DAY) {
        const dStr = toDateKey(u);
        const year = +dStr.substring(0, 4);
        if (year !== lastYear) { precalcFatigue(year, crew); lastYear = year; }

        const day = resolveDaySchedule(dStr, crew);
        const ex  = day.ex;

        if (day.isOff) {
            // Vacations show as all-day events; ordinary off days are skipped.
            if (ex && ex.type === 'Vacation') {
                lines.push(
                    'BEGIN:VEVENT',
                    `UID:shifthub-${dStr}@stla-shifthub`,
                    `DTSTAMP:${stamp}`,
                    `DTSTART;VALUE=DATE:${_icsDate(dStr)}`,
                    `DTEND;VALUE=DATE:${_icsDate(dStr, 1)}`,
                    `SUMMARY:${_icsEscape('🏖️ Vacation')}`,
                    'END:VEVENT'
                );
            }
            continue;
        }

        let title = day.isNight ? 'Night Shift' : 'Day Shift';
        if (ex && ex.crew && ex.crew !== crew) title += ex.crew === 'OT' ? ' (OT)' : ` (${ex.crew} crew)`;
        const otH = (ex?.otHours || 0) + (ex?.dtHours || 0) + (ex?.shift2?.otHours || 0) + (ex?.shift2?.dtHours || 0);
        if (otH > 0) title += ` · ${otH}h OT`;

        lines.push(
            'BEGIN:VEVENT',
            `UID:shifthub-${dStr}@stla-shifthub`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${_icsDateTime(dStr, day.startTime)}`,
            `DTEND:${_icsDateTime(dStr, day.startTime, day.durH)}`,
            `SUMMARY:${_icsEscape(title)}`,
            `DESCRIPTION:${_icsEscape(`Crew ${crew} · ${formatTime12(day.startTime)}–${formatTime12(day.endTime)} · exported by Shift Hub`)}`,
            'END:VEVENT'
        );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}

/** Export the next 12 months as a shareable/downloadable .ics file. */
async function exportICS() {
    haptic();
    const crew = (document.getElementById('crew-select') || {}).value || sysSettings.defaultCrew;
    const lt   = getLogicalToday();
    const from = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    const to   = addMonths(from, 12);
    const ics  = buildICS(crew, from, to);
    const fileName = `ShiftHub_Crew${crew}_Schedule.ics`;

    // Cordova: write + share like the JSON backup export
    if (window.cordova && window.cordova.file && window.plugins && window.plugins.socialsharing) {
        _cordovaWriteAndShare(ics, fileName, 'text/calendar', 'Shift schedule attached — open to add it to your calendar.');
        return;
    }

    // Browser: Web Share API, else plain download
    const shareFile = new File([ics], fileName, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        try {
            await navigator.share({ files: [shareFile], title: 'Shift Hub Schedule' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Calendar file downloaded');
}
