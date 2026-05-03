// ─── Year selector ────────────────────────────────────────────────────────────

function changeYear(dir) {
    const ys  = document.getElementById('year-select');
    const cur = parseInt(ys.value);
    if (cur + dir >= sysSettings.startYear && cur + dir <= sysSettings.endYear) {
        ys.value = cur + dir;
        haptic();
        renderCalendar();
    }
}

function populateYearSelect() {
    const select = document.getElementById('year-select');
    if (!select) return;
    const currentYear = getLogicalToday().getFullYear();
    const currentVal  = select.value;
    select.innerHTML  = '';
    for (let y = sysSettings.startYear; y <= sysSettings.endYear; y++) {
        const opt = document.createElement('option');
        opt.value   = y;
        opt.innerText = y;
        if (currentVal ? (y == currentVal) : (y == currentYear)) opt.selected = true;
        select.appendChild(opt);
    }
}