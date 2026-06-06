// ─── Settings state ───────────────────────────────────────────────────────────

let selectedRotOffset = null;

// ─── Settings sheet ───────────────────────────────────────────────────────────

function openSettingsSheet() {
    haptic();
    const yearSelect = document.getElementById('year-select');
    const year       = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear();
    const cppS       = document.getElementById('cpp-max-pp');
    const eiS        = document.getElementById('ei-max-pp');
    let opts = `<option value="9999">Not Met Yet</option>`;
    for (let i = 0; i < 300; i++) {
        const ppE = new Date(basePPStartUTC + (i * 14 + 13) * MS_DAY);
        if (ppE.getUTCFullYear() === year) opts += `<option value="${i}">Ending ${ppE.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</option>`;
    }
    if (cppS) cppS.innerHTML = opts;
    if (eiS)  eiS.innerHTML  = opts;

    const fields = {
        'setting-theme':        { el: null, key: 'theme' },
        'setting-display-name': { el: null, key: 'displayName' },
        'setting-reg-rate':     { el: null, key: 'regRate', fmt: v => v.toFixed(2) },
        'setting-tl-rate':      { el: null, key: 'tlRate',  fmt: v => v.toFixed(2) },
        'setting-default-role': { el: null, key: 'defaultRole' },
        'setting-vacation-limit':{ el: null, key: 'vacationLimit' },
        'setting-vac-start':    { el: null, key: 'vacationStartDate' },
        'setting-vac-end':      { el: null, key: 'vacationEndDate' },
        'setting-default-crew': { el: null, key: 'defaultCrew' },
        'setting-start-year':   { el: null, key: 'startYear' },
        'setting-end-year':     { el: null, key: 'endYear' }
    };
    for (const [id, cfg] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = cfg.fmt ? cfg.fmt(sysSettings[cfg.key]) : sysSettings[cfg.key];
    }

    const checkboxes = {
        'setting-notif-24':  'notif24h',
        'setting-notif-12':  'notif12h',
        'setting-notif-3':   'notif3h',
'setting-cal-sync':  'syncCalendar',
        'setting-alarms':    'smartAlarms'
    };
    for (const [id, key] of Object.entries(checkboxes)) {
        const el = document.getElementById(id);
        if (el) el.checked = sysSettings[key];
    }

    const rotInput = document.getElementById('rot-date-input');
    if (rotInput) rotInput.value = savedRot.date;

    selectedRotOffset = savedRot.offset;
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => {
        b.classList.remove('active');
        if (b.id === 'btn-rot-' + selectedRotOffset) b.classList.add('active');
    });

    if (cppS) cppS.value = sysSettings.cppMaxPP;
    if (eiS)  eiS.value  = sysSettings.eiMaxPP;

    openSheet('sheet-settings');
}

function saveSettings() {
    haptic();
    const g = id => document.getElementById(id);
    sysSettings = {
        theme:             g('setting-theme')         ? g('setting-theme').value           : 'system',
        displayName:       g('setting-display-name')  ? (g('setting-display-name').value || 'Drizzy') : 'Drizzy',
        regRate:           g('setting-reg-rate')       ? (parseFloat(g('setting-reg-rate').value) || 47.06)  : 47.06,
        tlRate:            g('setting-tl-rate')        ? (parseFloat(g('setting-tl-rate').value) || 50.11)  : 50.11,
        defaultRole:       g('setting-default-role')   ? (g('setting-default-role').value || 'Reg') : 'Reg',
        vacationLimit:     g('setting-vacation-limit') ? (parseFloat(g('setting-vacation-limit').value) || 150) : 150,
        vacationStartDate: g('setting-vac-start') && g('setting-vac-start').value ? g('setting-vac-start').value : '2026-01-01',
        vacationEndDate:   g('setting-vac-end')   && g('setting-vac-end').value   ? g('setting-vac-end').value   : '2027-01-15',
        cppMaxPP:          g('cpp-max-pp') ? parseInt(g('cpp-max-pp').value) : 9999,
        eiMaxPP:           g('ei-max-pp')  ? parseInt(g('ei-max-pp').value)  : 9999,
        defaultCrew:       g('setting-default-crew')   ? g('setting-default-crew').value : 'D',
        startYear:         g('setting-start-year') ? (parseInt(g('setting-start-year').value) || 2024) : 2024,
        endYear:           g('setting-end-year')   ? (parseInt(g('setting-end-year').value)   || 2036) : 2036,
        notif24h:          g('setting-notif-24')    ? g('setting-notif-24').checked    : true,
        notif12h:          g('setting-notif-12')    ? g('setting-notif-12').checked    : true,
        notif3h:           g('setting-notif-3')     ? g('setting-notif-3').checked     : true,
syncCalendar:      g('setting-cal-sync')    ? g('setting-cal-sync').checked    : false,
        smartAlarms:       g('setting-alarms')      ? g('setting-alarms').checked      : false
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings));

    const gText = document.getElementById('greeting-text');
    if (gText) gText.innerHTML = `<span>${sysSettings.displayName}</span>`;

    const rotInput = document.getElementById('rot-date-input');
    if (rotInput && rotInput.value && selectedRotOffset !== null) {
        savedRot = { date: rotInput.value, offset: selectedRotOffset };
        localStorage.setItem(STORAGE_KEYS.ROTATION, JSON.stringify(savedRot));
    }
    populateYearSelect();
    renderCalendar();
    closeAllSheets();
    updateNotifications();
    showToast('Settings Saved');
}

function selectRotOffset(o) {
    haptic();
    selectedRotOffset = o;
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('btn-rot-' + o);
    if (btn) btn.classList.add('active');
}