// ─── Persistent state (loaded from localStorage) ─────────────────────────────

let extraShifts  = safeParse(STORAGE_KEYS.SHIFTS,        {});
let savedRot     = safeParse(STORAGE_KEYS.ROTATION,      { date: '2026-04-20', offset: 0 });
let sysSettings  = safeParse(STORAGE_KEYS.SETTINGS,      {});
let syncedEvents = safeParse(STORAGE_KEYS.SYNCED_EVENTS, {});

// ─── Computed state (rebuilt each render pass) ────────────────────────────────

/** Per-day fatigue/lockout data keyed by YYYY-MM-DD, populated by precalcFatigue(). */
let dayFatigue = {};

// ─── Defaults ─────────────────────────────────────────────────────────────────

function initDefaults() {
    if (!sysSettings.theme)              sysSettings.theme             = 'system';
    if (!sysSettings.displayName)        sysSettings.displayName       = 'Drizzy';
    if (!sysSettings.regRate)            sysSettings.regRate           = 47.06;
    if (!sysSettings.tlRate)             sysSettings.tlRate            = 50.11;
    if (!sysSettings.defaultRole)        sysSettings.defaultRole       = 'Reg';
    if (!sysSettings.vacationLimit)      sysSettings.vacationLimit     = 150;
    if (!sysSettings.defaultCrew)        sysSettings.defaultCrew       = 'D';
    if (sysSettings.cppMaxPP  === undefined) sysSettings.cppMaxPP      = 9999;
    if (sysSettings.eiMaxPP   === undefined) sysSettings.eiMaxPP       = 9999;
    if (!sysSettings.startYear)          sysSettings.startYear         = 2024;
    if (!sysSettings.endYear)            sysSettings.endYear           = 2036;
    if (!sysSettings.vacationStartDate)  sysSettings.vacationStartDate = '2026-01-01';
    if (!sysSettings.vacationEndDate)    sysSettings.vacationEndDate   = '2027-01-15';
    if (sysSettings.notif24h  === undefined) sysSettings.notif24h      = true;
    if (sysSettings.notif12h  === undefined) sysSettings.notif12h      = true;
    if (sysSettings.notif3h   === undefined) sysSettings.notif3h       = true;
if (sysSettings.syncCalendar  === undefined) sysSettings.syncCalendar  = false;
    if (sysSettings.smartAlarms   === undefined) sysSettings.smartAlarms   = false;
}

initDefaults();
