/**
 * Resolve what actually happens on a given day: off or working, start/end
 * times and duration, honouring extraShifts overrides, the base rotation and
 * fatigue lockouts. Single source of truth shared by the calendar sync, the
 * notification scheduler and the ICS export.
 * Requires precalcFatigue() to have run for the relevant year.
 * @param {string} dStr  YYYY-MM-DD
 * @param {string} crew  'A'|'B'|'C'|'D'
 * @returns {{ isOff:boolean, startTime:string|null, endTime:string|null,
 *             durH:number, isNight:boolean, ex:Object|undefined }}
 */
function resolveDaySchedule(dStr, crew) {
    const pI = getPIndex(Date.UTC(+dStr.substring(0, 4), +dStr.substring(5, 7) - 1, +dStr.substring(8, 10)));
    const bS = getShiftForCrew(pI, crew);
    const ex = extraShifts[dStr];
    const f  = dayFatigue[dStr] || {};

    let sTime = null, isOff = false;

    if (ex) {
        if (['Off', 'DropOff', 'Vacation', 'Lieu', 'OffDay'].includes(ex.type) && (!ex.startTime || !ex.endTime)) {
            isOff = true;
        } else if (ex.startTime) {
            sTime = ex.startTime;
        } else if (ex.type === 'DropPaid') {
            isOff = true;
        } else if (ex.type === 'Day') {
            sTime = '06:30';
        } else if (ex.type === 'Night') {
            sTime = '18:30';
        }
    }

    if (!sTime && !isOff && !ex) {
        if      (bS === 'D') { sTime = '06:30'; }
        else if (bS === 'N') { sTime = '18:30'; }
        else if (bS === 'O') { isOff = true; }
    }

    if (f.isLockout && (!ex || !ex.overrideLockout)) isOff = true;

    if (isOff || !sTime) return { isOff: true, startTime: null, endTime: null, durH: 0, isNight: false, ex };

    const sh    = parseInt(sTime.split(':')[0], 10);
    const eTime = (ex && ex.endTime) || (sh >= 12 ? '06:30' : '18:30');
    let isNight = sh >= 12;
    if (ex && ex.type === 'Day')   isNight = false;
    if (ex && ex.type === 'Night') isNight = true;
    return { isOff: false, startTime: sTime, endTime: eTime, durH: getDuration(sTime, eTime), isNight, ex };
}

/**
 * Sync a single day to the device's native calendar.
 * Deletes the previous event for that day (if any) then creates a new one.
 * Requires cordova-plugin-calendar and sysSettings.syncCalendar === true.
 * @param {string} dStr  YYYY-MM-DD
 */
function safeSingleDaySync(dStr) {
    const crew = sysSettings.defaultCrew;
    const day  = resolveDaySchedule(dStr, crew);
    const ex   = day.ex;

    const [y, m, d] = dStr.split('-').map(Number);
    let start, end, title;

    if (day.isOff) {
        start = new Date(y, m - 1, d, 0, 0, 0);
        end   = new Date(y, m - 1, d, 23, 59, 59);
        title = 'OFF SHIFT';
    } else {
        const [sh, smin] = day.startTime.split(':').map(Number);
        start = new Date(y, m - 1, d, sh, smin, 0);
        end   = new Date(start.getTime() + day.durH * 3600000);
        title = day.isNight ? 'NIGHT SHIFT' : 'DAY SHIFT';
        if (ex && ex.crew && ex.crew !== sysSettings.defaultCrew) {
            title += /^[A-D]$/.test(ex.crew) ? ` (${ex.crew}-SHIFT)` : (ex.crew === 'OT' ? ' (OT)' : ` (${ex.crew})`);
        }
    }

    const oldSync = syncedEvents[dStr];

    function createNewEvent() {
        window.plugins.calendar.createEvent(title, 'Plant', 'Auto-synced by Shift Hub', start, end, () => {
            syncedEvents[dStr] = { title, start: start.getTime(), end: end.getTime() };
            localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, JSON.stringify(syncedEvents));
            renderCalendar();
        }, () => { renderCalendar(); });
    }

    if (oldSync) {
        window.plugins.calendar.deleteEvent(oldSync.title, 'Plant', 'Auto-synced by Shift Hub', new Date(oldSync.start), new Date(oldSync.end),
            () => { delete syncedEvents[dStr]; localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, JSON.stringify(syncedEvents)); createNewEvent(); },
            () => { delete syncedEvents[dStr]; localStorage.setItem(STORAGE_KEYS.SYNCED_EVENTS, JSON.stringify(syncedEvents)); createNewEvent(); }
        );
    } else {
        createNewEvent();
    }
}

/**
 * Check/request calendar permission then sync the active date, or just re-render.
 * Only syncs if sysSettings.syncCalendar is enabled and a date is active.
 */
function handleCalendarSyncAndRender() {
    if (sysSettings.syncCalendar && window.plugins && window.plugins.calendar && activeDate) {
        const dateToSync = activeDate; // capture before async callbacks run
        window.plugins.calendar.hasReadWritePermission(hasPerm => {
            if (!hasPerm) {
                window.plugins.calendar.requestReadWritePermission(
                    () => safeSingleDaySync(dateToSync),
                    () => { showToast('Calendar Permission Denied', 'error'); renderCalendar(); }
                );
            } else {
                safeSingleDaySync(dateToSync);
            }
        });
    } else {
        renderCalendar();
    }
}

/**
 * Cancel all pending local notifications and reschedule the next 30 days of shift alerts.
 * Schedules up to 4 notifications per working day: 24h, 12h, 3h warnings + optional wake-up alarm.
 * Falls through to handleCalendarSyncAndRender() when done (or if plugin is unavailable).
 *
 * Cancellation uses explicit IDs rather than cancelAll() because cancelAll() queries the
 * plugin's internal storage — if that storage is stale on Android, pending alarms survive.
 * Notification IDs are deterministic (shortDate + type digit) so they can be cancelled
 * directly by ID without relying on the plugin's stored list.
 */
function updateNotifications() {
    if (!window.cordova || !cordova.plugins || !cordova.plugins.notification || !cordova.plugins.notification.local) {
        handleCalendarSyncAndRender();
        return;
    }

    const crew   = sysSettings.defaultCrew;
    const now    = new Date();
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const notifications = [];
    const cancelIds     = [];

    precalcFatigue(now.getFullYear(), crew);
    if (now.getMonth() === 11) precalcFatigue(now.getFullYear() + 1, crew);
    if (now.getMonth() === 0)  precalcFatigue(now.getFullYear() - 1, crew);

    for (let i = 0; i < 30; i++) {
        const checkUTC  = nowUTC + i * MS_DAY;
        const dStr      = toDateKey(checkUTC);
        const shortDate = dStr.replace(/-/g, '').substring(2);

        cancelIds.push(parseInt(shortDate + '1'), parseInt(shortDate + '2'), parseInt(shortDate + '3'), parseInt(shortDate + '4'), parseInt(shortDate + '5'));

        const day   = resolveDaySchedule(dStr, crew);
        const sTime = day.startTime;

        if (sTime && !day.isOff) {
            const [hh, mm]   = sTime.split(':').map(Number);
            const shiftStart = new Date(+dStr.substring(0, 4), +dStr.substring(5, 7) - 1, +dStr.substring(8, 10), hh, mm, 0);
            const shiftName  = day.isNight ? 'Night Shift' : 'Day Shift';

            if (sysSettings.notif24h) {
                const t24 = new Date(shiftStart.getTime() - 24 * 3600000);
                if (t24 > now) notifications.push({
                    id: parseInt(shortDate + '1'), title: 'Upcoming Shift in 24h',
                    text: `You have a ${shiftName} starting tomorrow at ${formatTime12(sTime)}.`,
                    trigger: { at: t24 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ff6d00'
                });
            }
            if (sysSettings.notif12h) {
                const t12 = new Date(shiftStart.getTime() - 12 * 3600000);
                if (t12 > now) notifications.push({
                    id: parseInt(shortDate + '2'), title: 'Upcoming Shift in 12h',
                    text: `You have a ${shiftName} starting today at ${formatTime12(sTime)}.`,
                    trigger: { at: t12 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ff6d00'
                });
            }
            if (sysSettings.notif3h) {
                const t3 = new Date(shiftStart.getTime() - 3 * 3600000);
                if (t3 > now) notifications.push({
                    id: parseInt(shortDate + '3'), title: 'Shift Starts Soon',
                    text: `Your ${shiftName} starts in 3 hours (${formatTime12(sTime)}).`,
                    trigger: { at: t3 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ea4335'
                });
            }
            if (sysSettings.smartAlarms) {
                const wakeTime = new Date(shiftStart.getTime() - 2 * 3600000);
                if (wakeTime > now) notifications.push({
                    id: parseInt(shortDate + '4'), title: `⏰ WAKE UP - ${shiftName}`,
                    text: `Your shift starts in 2 hours!`,
                    trigger: { at: wakeTime }, priority: 2, wakeup: true, sound: 'default', vibrate: true, color: '#ff3b30'
                });
            }

            // On-shift status card: pinned only WHILE the shift runs. Appears at
            // shift start (immediately if we're already mid-shift), auto-dismissed
            // at shift end via timeoutAfter — no app wake-up needed. Its input
            // action drops a note straight onto the day (handler in app.js).
            if (sysSettings.shiftNotif && day.durH > 0) {
                const shiftEnd = new Date(shiftStart.getTime() + day.durH * 3600000);
                if (shiftEnd > now) {
                    const n = {
                        id: parseInt(shortDate + '5'),
                        title: `${shiftName} · Crew ${crew}`,
                        text: `${formatTime12(sTime)} – ${formatTime12(day.endTime)} · tap Add note to log something`,
                        sticky: true, priority: -1, wakeup: false, sound: false,
                        smallIcon: 'res://icon', color: '#ff6d00',
                        timeoutAfter: shiftEnd.getTime() - Math.max(shiftStart.getTime(), now.getTime()),
                        actions: [{ id: 'shift-note', type: 'input', title: '📝 Add note', emptyText: 'Quick note…' }],
                        data: { dStr }
                    };
                    if (shiftStart > now) n.trigger = { at: shiftStart };
                    notifications.push(n);
                }
            }
        }
    }

    cordova.plugins.notification.local.cancel(cancelIds, () => {
        if (notifications.length > 0) cordova.plugins.notification.local.schedule(notifications);
        handleCalendarSyncAndRender();
    });
}
