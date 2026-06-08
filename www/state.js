// ─── Persistent state (loaded from localStorage) ─────────────────────────────

let extraShifts  = safeParse(STORAGE_KEYS.SHIFTS,        {});
let savedRot     = safeParse(STORAGE_KEYS.ROTATION,      { date: '2026-04-20', offset: 0 });
let sysSettings  = safeParse(STORAGE_KEYS.SETTINGS,      {});
let syncedEvents = safeParse(STORAGE_KEYS.SYNCED_EVENTS, {});
let taxTables    = safeParse(STORAGE_KEYS.TAX_TABLES,    null);

// ─── Computed state (rebuilt each render pass) ────────────────────────────────

/** Per-day fatigue/lockout data keyed by YYYY-MM-DD, populated by precalcFatigue(). */
let dayFatigue = {};

// ─── Tax table built-ins & lookup ─────────────────────────────────────────────

const TAX_BUILT_INS = {
    2024: { fedBPA:15705, onBPA:12399, cea:1433, cppRate:0.0595, annCPPMax:3867.50, ympe:68500, cpp2Rate:0.04, annCPP2Max:188.00,  yampe:73200, eiRate:0.0166, annEIMax:1049.12 },
    2025: { fedBPA:16129, onBPA:12747, cea:1471, cppRate:0.0595, annCPPMax:4034.10, ympe:71300, cpp2Rate:0.04, annCPP2Max:396.00,  yampe:81200, eiRate:0.0164, annEIMax:1077.48 },
    2026: { fedBPA:16452, onBPA:12989, cea:1501, cppRate:0.0595, annCPPMax:4230.45, ympe:74600, cpp2Rate:0.04, annCPP2Max:416.00,  yampe:85000, eiRate:0.0163, annEIMax:1123.07 }
};

function getTaxYear(year) {
    const stored = taxTables && (taxTables[year] || taxTables[String(year)]);
    return stored || TAX_BUILT_INS[year] || TAX_BUILT_INS[String(year)] || TAX_BUILT_INS[2026];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function initDefaults() {
    if (!sysSettings.theme)              sysSettings.theme             = 'system';
    if (!sysSettings.displayName)        sysSettings.displayName       = 'Drizzy';
    if (!sysSettings.regRate)            sysSettings.regRate           = 47.06;
    if (!sysSettings.tlRate)             sysSettings.tlRate            = 50.11;
    if (!sysSettings.defaultRole)        sysSettings.defaultRole       = 'Reg';
    if (!sysSettings.vacationLimit)      sysSettings.vacationLimit     = 150;
    if (!sysSettings.defaultCrew)        sysSettings.defaultCrew       = 'D';
    if (sysSettings.cppMaxPP   === undefined) sysSettings.cppMaxPP      = 9999;
    if (sysSettings.cpp2MaxPP  === undefined) sysSettings.cpp2MaxPP     = 9999;
    if (sysSettings.eiMaxPP    === undefined) sysSettings.eiMaxPP       = 9999;
    if (!sysSettings.startYear)          sysSettings.startYear         = 2024;
    if (!sysSettings.endYear)            sysSettings.endYear           = 2036;
    if (!sysSettings.vacationStartDate)  sysSettings.vacationStartDate = '2026-01-01';
    if (!sysSettings.vacationEndDate)    sysSettings.vacationEndDate   = '2027-01-15';
    if (sysSettings.notif24h  === undefined) sysSettings.notif24h      = true;
    if (sysSettings.notif12h  === undefined) sysSettings.notif12h      = true;
    if (sysSettings.notif3h   === undefined) sysSettings.notif3h       = true;
if (sysSettings.syncCalendar  === undefined) sysSettings.syncCalendar  = false;
    if (sysSettings.smartAlarms   === undefined) sysSettings.smartAlarms   = false;
    if (sysSettings.hasSeenOnboarding === undefined) sysSettings.hasSeenOnboarding = false;
}

initDefaults();
