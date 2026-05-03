const pattern = ['D','D','O','O','N','N','N','O','O','D','D','O','O','O','N','N','O','O','D','D','D','O','O','N','N','O','O','O'];
const realToday = new Date(); 
realToday.setHours(0, 0, 0, 0);
const cal = document.getElementById('calendar');
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const daysOfWeek = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];

// Global Haptic Engine
function haptic() {
    if (navigator.vibrate) navigator.vibrate(10);
}

// Native Toast Engine
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `native-toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    haptic();
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function safeParse(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        const parsed = JSON.parse(v);
        return parsed == null ? fallback : parsed;
    } catch (e) {
        console.warn(`Failed to parse localStorage key "${key}":`, e);
        return fallback;
    }
}

// Core Data State
let extraShifts = safeParse('kingDrewShiftsV20', {});
let savedRot = safeParse('kingDrewRotationV20', { date: '2026-04-20', offset: 0 });
let sysSettings = safeParse('kingDrewSettingsV20', {});

// Ledger to prevent Calendar Cursor Crashes
let syncedEvents = safeParse('kingDrewSyncedEventsV20', {});

// Centralized Defaults Engine
function initDefaults() {
    if (!sysSettings.theme) sysSettings.theme = 'system';
    if (!sysSettings.displayName) sysSettings.displayName = 'Drizzy';
    if (!sysSettings.regRate) sysSettings.regRate = 47.06;
    if (!sysSettings.tlRate) sysSettings.tlRate = 50.11;
    if (!sysSettings.defaultRole) sysSettings.defaultRole = 'Reg';
    if (!sysSettings.vacationLimit) sysSettings.vacationLimit = 150;
    if (!sysSettings.defaultCrew) sysSettings.defaultCrew = 'D';
    if (sysSettings.cppMaxPP === undefined) sysSettings.cppMaxPP = 9999;
    if (sysSettings.eiMaxPP === undefined) sysSettings.eiMaxPP = 9999;
    if (!sysSettings.startYear) sysSettings.startYear = 2024;
    if (!sysSettings.endYear) sysSettings.endYear = 2036;
    if (!sysSettings.vacationStartDate) sysSettings.vacationStartDate = '2026-01-01';
    if (!sysSettings.vacationEndDate) sysSettings.vacationEndDate = '2027-01-15';
    if (sysSettings.notif24h === undefined) sysSettings.notif24h = true;
    if (sysSettings.notif12h === undefined) sysSettings.notif12h = true;
    if (sysSettings.notif3h === undefined) sysSettings.notif3h = true;
    if (sysSettings.useBiometrics === undefined) sysSettings.useBiometrics = false;
    if (sysSettings.syncCalendar === undefined) sysSettings.syncCalendar = false;
    if (sysSettings.smartAlarms === undefined) sysSettings.smartAlarms = false;
}

initDefaults();

let chartInstance = null; 

function applyTheme(themeVal) {
    let isLight = false;
    if (themeVal === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.setAttribute('data-theme', 'light');
            document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f2f2f7');
            isLight = true;
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.querySelector('meta[name="theme-color"]').setAttribute('content', '#121212');
        }
    } else {
        document.documentElement.setAttribute('data-theme', themeVal);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', themeVal === 'light' ? '#f2f2f7' : '#121212');
        isLight = (themeVal === 'light');
    }
    
    if (window.StatusBar) {
        if (isLight) {
            StatusBar.backgroundColorByHexString('#f2f2f7');
            StatusBar.styleDefault(); 
        } else {
            StatusBar.backgroundColorByHexString('#121212');
            StatusBar.styleLightContent(); 
        }
    }
}

applyTheme(sysSettings.theme);
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (sysSettings.theme === 'system') applyTheme('system');
});

function changeYear(dir) {
    let ys = document.getElementById('year-select');
    let cur = parseInt(ys.value);
    if (cur + dir >= sysSettings.startYear && cur + dir <= sysSettings.endYear) {
        ys.value = cur + dir;
        haptic();
        renderCalendar();
    }
}

function exportData() {
    haptic();
    let data = {
        shifts: localStorage.getItem('kingDrewShiftsV20'),
        settings: localStorage.getItem('kingDrewSettingsV20'),
        rotation: localStorage.getItem('kingDrewRotationV20'),
        synced: localStorage.getItem('kingDrewSyncedEventsV20')
    };
    
    let jsonString = JSON.stringify(data);
    let fileName = `STLA_ShiftHub_Backup_${new Date().toISOString().split('T')[0]}.json`;

    if (window.plugins && window.plugins.socialsharing) {
        let base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        let fileUrl = 'data:application/json;base64,' + base64Data;
        window.plugins.socialsharing.share('Here is your STLA Shift Hub backup data.', fileName, fileUrl, null);
        showToast('Native Share Menu Opened');
    } else if (navigator.canShare) {
        let file = new File([jsonString], fileName, {type: 'application/json'});
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'STLA Backup', text: 'Backup data' }).catch(err => console.log(err));
        }
    } else {
        navigator.clipboard.writeText(jsonString).then(() => {
            showToast('Backup COPIED to clipboard! Paste into your notes/email to save.', 'success');
        });
    }
}

function importData(e) {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(evt) {
        try {
            let data = JSON.parse(evt.target.result);
            
            let shiftsToSave = typeof data.shifts === 'string' ? data.shifts : JSON.stringify(data.shifts || {});
            let settingsToSave = typeof data.settings === 'string' ? data.settings : JSON.stringify(data.settings || {});
            let rotToSave = typeof data.rotation === 'string' ? data.rotation : JSON.stringify(data.rotation || {});
            let syncToSave = typeof data.synced === 'string' ? data.synced : JSON.stringify(data.synced || {});
            
            localStorage.setItem('kingDrewShiftsV20', shiftsToSave);
            localStorage.setItem('kingDrewSettingsV20', settingsToSave);
            localStorage.setItem('kingDrewRotationV20', rotToSave);
            localStorage.setItem('kingDrewSyncedEventsV20', syncToSave);
            
            extraShifts = safeParse('kingDrewShiftsV20', {});
            savedRot = safeParse('kingDrewRotationV20', { date: '2026-04-20', offset: 0 });
            sysSettings = safeParse('kingDrewSettingsV20', {});
            syncedEvents = safeParse('kingDrewSyncedEventsV20', {});
            
            initDefaults(); 
            applyTheme(sysSettings.theme);
            
            let gText = document.getElementById('greeting-text');
            if(gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;
            
            let cSel = document.getElementById('crew-select');
            if(cSel) cSel.value = sysSettings.defaultCrew;
            
            populateYearSelect();
            renderCalendar();
            updateNotifications();
            
            showToast('Backup Restored Successfully!');
            closeAllSheets();
        } catch(err) {
            console.error("Import Error: ", err);
            showToast('Invalid backup file. Import failed.', 'error');
        } finally {
            document.getElementById('import-file').value = ''; 
        }
    };
    reader.readAsText(file);
}

function exportPDF() {
    haptic();
    if (!window.jspdf) {
        showToast("PDF Library loading, try again.", "error");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const ppEl = document.querySelector('.pp-card');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("STLA Shift Hub", 15, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text("Pay Period Summary & Financials", 15, 30);
    
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0);
    
    let y = 45;
    let textLines = ppEl ? ppEl.innerText.split('\n') : ["No data available"];
    
    textLines.forEach(line => {
        if(line.trim() === '') return;
        if(line.includes("Total Worked") || line.includes("Net Pay") || line.includes("Gross")) {
            doc.setFont("helvetica", "bold");
        } else {
            doc.setFont("helvetica", "normal");
        }
        
        doc.text(line, 15, y);
        y += 7;
        
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
    });

    let fileName = `STLA_Paystub_${new Date().getTime()}.pdf`;
    
    if (window.plugins && window.plugins.socialsharing) {
        let pdfDataUri = doc.output('datauristring');
        window.plugins.socialsharing.share('Paystub PDF attached.', fileName, pdfDataUri, null);
    } else {
        doc.save(fileName);
        showToast("PDF Generated!");
    }
}

function sharePayPeriod() {
    haptic();
    const ppEl = document.querySelector('.pp-card');
    if(!ppEl) return;
    const textToShare = ppEl.innerText;
    
    if (window.plugins && window.plugins.socialsharing) {
        window.plugins.socialsharing.share(textToShare, 'STLA Pay Period Summary', null, null);
    } else if (navigator.share) {
        navigator.share({ title: 'STLA Pay Period Summary', text: textToShare }).catch(console.error);
    } else {
        navigator.clipboard.writeText(textToShare).then(() => showToast('Copied to clipboard!'));
    }
}

let activeDate = null, activeCurrentShift = null, activeNextShift = null;
let selectedType = null, selectedCrew = null, selectedRole = sysSettings.defaultRole, selectedRotOffset = null;
let dayFatigue = {}; 

const basePPStartUTC = Date.UTC(2025, 11, 19); 

function addMonths(utcMs, months) {
    const d = new Date(utcMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

function normalizeCrew(crew) {
    if (!crew) return crew;
    if (crew === 'OT' || /^[A-D]$/.test(crew)) return crew;
    if (typeof crew === 'string' && crew.endsWith(' Shift')) return crew.charAt(0);
    return crew;
}

function formatCrewLabel(crew) {
    if (!crew) return '';
    if (crew === 'OT') return 'OT';
    if (typeof crew === 'string' && crew.endsWith(' Shift')) return crew;
    return crew + ' Shift';
}

function getPIndex(currUTC) {
    const refParts = savedRot.date.split('-');
    const refDate = new Date(Date.UTC(refParts[0], refParts[1] - 1, refParts[2]));
    return ((((Math.floor((currUTC - refDate.getTime()) / 86400000)) + savedRot.offset) % 28) + 28) % 28;
}

function getShiftForCrew(basePIndex, crew) {
    let effectiveIndex = basePIndex, invert = false;
    if (crew === 'C') invert = true;
    else if (crew === 'B') effectiveIndex = (basePIndex + 21) % 28;
    else if (crew === 'A') { effectiveIndex = (basePIndex + 21) % 28; invert = true; }
    let shift = pattern[effectiveIndex];
    if (invert) { if (shift === 'D') shift = 'N'; else if (shift === 'N') shift = 'D'; }
    return shift;
}

function getLogicalToday() {
    let d = new Date();
    let crewSelector = document.getElementById('crew-select');
    let crew = crewSelector && crewSelector.value ? crewSelector.value : sysSettings.defaultCrew;
    
    let currentHour = d.getHours();
    let currentMinute = d.getMinutes();
    
    if (currentHour < 6 || (currentHour === 6 && currentMinute < 30)) {
        let yesterday = new Date(d);
        yesterday.setDate(yesterday.getDate() - 1);
        let yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
        
        let yUTC = Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        let yBaseShift = getShiftForCrew(getPIndex(yUTC), crew);
        let yEx = extraShifts[yStr];
        
        let isNight = false;
        if (yEx) {
            if (yEx.type === 'Night') isNight = true;
            else if (['Day', 'Off', 'DropOff', 'Vacation', 'DropPaid', 'Lieu'].includes(yEx.type)) isNight = false;
            else if (yBaseShift === 'N') isNight = true;
        } else if (yBaseShift === 'N') {
            isNight = true;
        }
        
        if (isNight) {
            d.setDate(d.getDate() - 1);
        }
    }
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    let hour = parseInt(h, 10);
    let ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
}

function clearTimes() {
    haptic();
    let sInput = document.getElementById('input-start-time');
    let eInput = document.getElementById('input-end-time');
    let rInput = document.getElementById('input-ot-reason');
    if(sInput) sInput.value = '';
    if(eInput) eInput.value = '';
    if(rInput) rInput.value = '';
    resetSliders();
    updatePickupToggles();
}

function resetSliders() {
    let otSlider = document.getElementById('ot-slider');
    if (otSlider) otSlider.removeAttribute('data-user-modified');
    
    let shortSlider = document.getElementById('short-slider');
    if (shortSlider) shortSlider.removeAttribute('data-user-modified');
}

function populateYearSelect() {
    const select = document.getElementById('year-select');
    if(!select) return;
    const currentYear = getLogicalToday().getFullYear();
    const currentVal = select.value;
    select.innerHTML = '';
    for (let y = sysSettings.startYear; y <= sysSettings.endYear; y++) {
        let opt = document.createElement('option');
        opt.value = y; opt.innerText = y;
        if (currentVal ? (y == currentVal) : (y == currentYear)) opt.selected = true;
        select.appendChild(opt);
    }
}

function getFloatTime(t) { if (!t) return 0; let [h, m] = t.split(':'); return parseInt(h) + (parseInt(m)/60); }
function getDuration(s, e) { let st = getFloatTime(s), et = getFloatTime(e); if (et < st) et += 24; return et - st; }

function getShiftEndFloat(dateStr, crew) {
    if (dayFatigue[dateStr] && dayFatigue[dateStr].isLockout) return null;
    let s = getShiftForCrew(getPIndex(Date.UTC(dateStr.substring(0,4), dateStr.substring(5,7)-1, dateStr.substring(8,10))), crew);
    let ex = extraShifts[dateStr];
    if (ex) {
        if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type) && !ex.startTime) return null;
        if (ex.endTime) {
            let endF = getFloatTime(ex.endTime);
            if (ex.startTime && endF < getFloatTime(ex.startTime)) endF += 24;
            return endF;
        }
    }
    if (s === 'D') return 18.5;
    if (s === 'N') return 30.5;
    return null;
}

function getShiftStartFloat(dateStr, crew) {
    if (dayFatigue[dateStr] && dayFatigue[dateStr].isLockout) return null;
    let s = getShiftForCrew(getPIndex(Date.UTC(dateStr.substring(0,4), dateStr.substring(5,7)-1, dateStr.substring(8,10))), crew);
    let ex = extraShifts[dateStr];
    if (ex) {
        if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type) && !ex.startTime) return null;
        if (ex.startTime) return getFloatTime(ex.startTime);
    }
    if (s === 'D') return 6.5;
    if (s === 'N') return 18.5;
    return null;
}

function calcPremiums(dateStr, startStr, hours, rate) {
    let pT = 0, aft = 0, night = 0, sat = 0, sun = 0;
    if (hours <= 0) return { total: 0, aftHrs: 0, nightHrs: 0, satHrs: 0, sunHrs: 0 };
    let [y, m, d] = dateStr.split('-').map(Number);
    let [hh, mm] = startStr.split(':').map(Number);
    
    const startDow = new Date(Date.UTC(y, m-1, d)).getUTCDay();
    const startMin = hh * 60 + mm;
    const totalIters = Math.round(hours * 2);
    
    for (let i = 0; i < totalIters; i++) {
        const cumMin = startMin + i * 30;
        const dayOffset = Math.floor(cumMin / 1440);
        const wallH = Math.floor((cumMin % 1440) / 60);
        const dow = (startDow + dayOffset) % 7;
        let pR = 0;
        if (wallH >= 17 && wallH <= 23) { pR += 0.90; aft += 0.5; }
        else if (wallH >= 0 && wallH < 7) { pR += 0.95; night += 0.5; }
        if (dow === 6) { pR += 1.00; sat += 0.5; }
        else if (dow === 0) { pR += (rate * 0.10); sun += 0.5; }
        pT += (pR * 0.5);
    }
    return { total: pT, aftHrs: aft, nightHrs: night, satHrs: sat, sunHrs: sun };
}

function getPayPeriodsInYear(year) {
    let count = 0;
    let yearStart = Date.UTC(year, 0, 1);
    let yearEnd = Date.UTC(year, 11, 31);
    
    let startIdx = Math.floor((yearStart - basePPStartUTC) / 1209600000) - 1;
    let endIdx = Math.floor((yearEnd - basePPStartUTC) / 1209600000) + 1;
    
    for (let i = startIdx; i <= endIdx; i++) {
        let ppE = basePPStartUTC + i * 1209600000 + 1123200000;
        if (new Date(ppE).getUTCFullYear() === year) count++;
    }
    return count > 0 ? count : 26;
}

function calculateTaxes(biGross, ppI, targetYear = 2026) {
    let ppCount = getPayPeriodsInYear(targetYear);
    let annG = biGross * ppCount;
    
    let fedBPA = 16452, onBPA = 12989;
    let annCPPMax = 4230.45, cppRate = 0.0595;
    let annEIMax = 1123.07, eiRate = 0.0163;

    if (targetYear === 2024) { fedBPA = 15705; onBPA = 12399; annCPPMax = 3867.50; annEIMax = 1049.12; eiRate = 0.0166; }
    else if (targetYear === 2025) { fedBPA = 16200; onBPA = 12700; annCPPMax = 4000.00; annEIMax = 1100.00; eiRate = 0.0164; }
    
    let cpp = (ppI < sysSettings.cppMaxPP) ? Math.max(0, biGross - (3500 / ppCount)) * cppRate : 0;
    let ei = (ppI < sysSettings.eiMaxPP) ? biGross * eiRate : 0; 
    
    let annCPP = Math.min(cpp * ppCount, annCPPMax);
    let annEI = Math.min(ei * ppCount, annEIMax);
    let cea = 1433; 
    
    if (annG > 181440) {
        let excess = Math.min(annG - 181440, 258482 - 181440);
        fedBPA -= (excess / 77042) * (fedBPA - 14829);
    }
    
    let fedGross = 0;
    if (annG <= 58523) fedGross = annG * 0.14;
    else if (annG <= 117045) fedGross = 8193.22 + (annG - 58523) * 0.205;
    else if (annG <= 181440) fedGross = 20190.23 + (annG - 117045) * 0.26;
    else if (annG <= 258482) fedGross = 36932.93 + (annG - 181440) * 0.29;
    else fedGross = 59275.11 + (annG - 258482) * 0.33;
    
    let fedCredits = (fedBPA + annCPP + annEI + cea) * 0.14;
    let fedT = Math.max(0, fedGross - fedCredits);
    
    let onGross = 0;
    if (annG <= 53891) onGross = annG * 0.0505;
    else if (annG <= 107785) onGross = 2721.50 + (annG - 53891) * 0.0915;
    else if (annG <= 150000) onGross = 7652.80 + (annG - 107785) * 0.1116;
    else if (annG <= 220000) onGross = 12364.00 + (annG - 150000) * 0.1216;
    else onGross = 20876.00 + (annG - 220000) * 0.1316;
    
    let onCredits = (onBPA + annCPP + annEI) * 0.0505;
    let onT = Math.max(0, onGross - onCredits);
    
    let surtax = 0;
    if (onT > 5818) surtax += (onT - 5818) * 0.20;
    if (onT > 7446) surtax += (onT - 7446) * 0.36;
    onT += surtax;
    
    let ohp = 0;
    if (annG > 20000) {
        if (annG <= 36000) ohp = Math.min(300, (annG - 20000) * 0.06);
        else if (annG <= 48000) ohp = Math.min(450, 300 + (annG - 36000) * 0.06);
        else if (annG <= 72000) ohp = Math.min(600, 450 + (annG - 48000) * 0.25);
        else if (annG <= 200000) ohp = Math.min(750, 600 + (annG - 72000) * 0.25);
        else ohp = Math.min(900, 750 + (annG - 200000) * 0.25);
    }
    onT += ohp;
    
    return { cpp, ei, fedTax: fedT / ppCount, onTax: onT / ppCount, total: cpp + ei + (fedT / ppCount) + (onT / ppCount) };
}

function getHolidays(y) {
    y = parseInt(y); 
    let a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    let f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    let h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    let l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    let month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    let gf = new Date(Date.UTC(y, month - 1, day) - 2 * 86400000);
    
    let nthDay = (m, dow, n) => {
        let dt = new Date(Date.UTC(y, m, 1)), count = 0;
        while(dt.getUTCMonth() === m) { if(dt.getUTCDay() === dow) { count++; if(count === n) return dt; } dt.setUTCDate(dt.getUTCDate()+1); } return null;
    };
    let lastMon = (m, date) => {
        let dt = new Date(Date.UTC(y, m, date - 1));
        while(dt.getUTCDay() !== 1) dt.setUTCDate(dt.getUTCDate()-1);
        return dt;
    };
    let fmt = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;

    return {
        [fmt(new Date(Date.UTC(y, 0, 1)))]: { n: "New Year's Day", m: 1.5 },
        [fmt(nthDay(1, 1, 3))]: { n: "Family Day", m: 1.5 },
        [fmt(gf)]: { n: "Good Friday", m: 1.5 },
        [fmt(lastMon(4, 25))]: { n: "Victoria Day", m: 1.5 },
        [fmt(new Date(Date.UTC(y, 6, 1)))]: { n: "Canada Day", m: 1.5 },
        [fmt(nthDay(7, 1, 1))]: { n: "Civic Holiday", m: 1.5 },
        [fmt(nthDay(8, 1, 1))]: { n: "Labour Day", m: 1.5 },
        [fmt(nthDay(9, 1, 2))]: { n: "Thanksgiving", m: 1.5 },
        [fmt(new Date(Date.UTC(y, 11, 24)))]: { n: "Christmas Eve", m: 1.5 },
        [fmt(new Date(Date.UTC(y, 11, 25)))]: { n: "Christmas Day", m: 2.0 },
        [fmt(new Date(Date.UTC(y, 11, 26)))]: { n: "Boxing Day", m: 2.0 }
    };
}

function computeLieuBalance(refDateStr, viewCrew, excludeDateStr) {
    const refY = parseInt(refDateStr.substring(0,4));
    const refM = parseInt(refDateStr.substring(5,7))-1;
    const refD = parseInt(refDateStr.substring(8,10));
    const refUTC = Date.UTC(refY, refM, refD);
    const yStart = Date.UTC(sysSettings.startYear, 0, 1);
    const cachedHols = {};
    
    let events = [];
    for (let u = yStart; u <= refUTC; u += 86400000) {
        const c = new Date(u);
        const yr = c.getUTCFullYear();
        if (!cachedHols[yr]) cachedHols[yr] = getHolidays(yr);
        const dS = `${yr}-${String(c.getUTCMonth()+1).padStart(2,'0')}-${String(c.getUTCDate()).padStart(2,'0')}`;
        
        if (cachedHols[yr][dS] && getShiftForCrew(getPIndex(u), viewCrew) === 'O') {
            events.push({ type: 'earn', utc: u, expires: addMonths(u, 4) });
        }
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

function getVacationCycle(targetDateStr) {
    let baseStart = sysSettings.vacationStartDate || '2026-01-01';
    let baseEnd = sysSettings.vacationEndDate || '2026-12-31';
    
    let bYearStart = parseInt(baseStart.substring(0,4));
    let bYearEnd = parseInt(baseEnd.substring(0,4));
    let tYear = parseInt(targetDateStr.substring(0,4));

    let offset = tYear - bYearStart;
    
    let calcStart = (bYearStart + offset) + baseStart.substring(4);
    let calcEnd = (bYearEnd + offset) + baseEnd.substring(4);
    
    let maxIters = 5; 
    while ((targetDateStr < calcStart || targetDateStr > calcEnd) && maxIters > 0) {
        if (targetDateStr < calcStart) {
            offset--;
        } else if (targetDateStr > calcEnd) {
            offset++;
        }
        calcStart = (bYearStart + offset) + baseStart.substring(4);
        calcEnd = (bYearEnd + offset) + baseEnd.substring(4);
        maxIters--;
    }
    
    return { start: calcStart, end: calcEnd };
}

function getUsedVacationHours(viewCrew, refDateStr, excludeDate = null) {
    let totalVac = 0;
    if (!refDateStr) return 0;
    
    let cycle = getVacationCycle(refDateStr);
    let start = cycle.start;
    let end = cycle.end;

    for (let [dS, ex] of Object.entries(extraShifts)) {
        if (dS >= start && dS <= end && dS !== excludeDate) {
            if (ex.type === 'Vacation') {
                if (ex.vacHours !== undefined) {
                    totalVac += ex.vacHours;
                } else if (ex.startTime && ex.endTime) {
                    let pI = getPIndex(Date.UTC(parseInt(dS.substring(0,4)), parseInt(dS.substring(5,7))-1, parseInt(dS.substring(8,10))));
                    let bS = getShiftForCrew(pI, viewCrew);
                    let bH = (bS === 'D' || bS === 'N') ? 12 : 0;
                    let act = getDuration(ex.startTime, ex.endTime);
                    totalVac += Math.max(0, bH - act);
                } else {
                    let pI = getPIndex(Date.UTC(parseInt(dS.substring(0,4)), parseInt(dS.substring(5,7))-1, parseInt(dS.substring(8,10))));
                    let bS = getShiftForCrew(pI, viewCrew);
                    let bH = (bS === 'D' || bS === 'N') ? 12 : 0;
                    totalVac += bH || 12;
                }
            } else if (ex.vacHours > 0) {
                totalVac += ex.vacHours;
            }
        }
    }
    return totalVac;
}

function precalcFatigue(year, viewCrew) {
    dayFatigue = {}; const yearStart = Date.UTC(year-1, 11, 1); const yearEnd = Date.UTC(year+1, 0, 31);
    let sPP = Math.floor((yearStart - basePPStartUTC) / 1209600000); let ePP = Math.floor((yearEnd - basePPStartUTC) / 1209600000);
    
    for (let i = sPP; i <= ePP; i++) {
        let ppStart = basePPStartUTC + i * 1209600000; 
        let running = 0, limit = false, isD = (((i % 3) + 3) % 3) === 1;
        
        for(let d = 0; d <= 13; d++) {
            let utc = ppStart + d*86400000; let curr = new Date(utc); 
            let dStr = `${curr.getUTCFullYear()}-${String(curr.getUTCMonth()+1).padStart(2,'0')}-${String(curr.getUTCDate()).padStart(2,'0')}`;
            
            let bS = getShiftForCrew(getPIndex(utc), viewCrew); 
            let ex = extraShifts[dStr]; 
            let baseH = (bS === 'D' || bS === 'N') ? 12 : 0;
            
            if (ex && (ex.type === 'DropOff' || ex.type === 'DropPaid' || ex.type === 'Lieu')) baseH = 0; 
            
            let expectedToday = baseH;
            if (ex) {
                if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) expectedToday = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0;
                else if (ex.type === 'DropPaid') expectedToday = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12;
                else if (ex.startTime && ex.endTime) expectedToday = getDuration(ex.startTime, ex.endTime); 
                else if (ex.type) expectedToday = 12;
            }
            
            let lock = false; 
            if (limit) { lock = true; } 
            else if (running + expectedToday > 120.01) { lock = true; limit = true; }
            
            if (ex && ex.overrideLockout) { lock = false; limit = false; }
            
            if (lock) {
                baseH = 0;
                expectedToday = 0;
            }

            dayFatigue[dStr] = { ppIndex: i, ppDayIndex: d, baseWorkHours: baseH, scheduledWorkHours: expectedToday, isLockout: lock, isDropPeriod: isD, isPPBoundary: (d === 13) };
            if (!lock) running += expectedToday; 
            if (running >= 120) limit = true;
        }
    }
}

function renderCalendar() {
    if(!cal) return;
    const yearSelect = document.getElementById('year-select');
    const crewSelect = document.getElementById('crew-select');
    const year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear(); 
    const crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
    
    const logicalT = getLogicalToday();
    const nowUTC = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate()); 
    const currentTargetPPIndex = Math.floor((nowUTC - basePPStartUTC) / 1209600000);
    const todayStr = `${logicalT.getFullYear()}-${String(logicalT.getMonth()+1).padStart(2,'0')}-${String(logicalT.getDate()).padStart(2,'0')}`;

    precalcFatigue(year, crew);
    let yearHols = getHolidays(year);
    let fullCalendarHtml = '';
    
    for (let m = 0; m < 12; m++) {
        const first = new Date(year, m, 1); const last = new Date(year, m+1, 0); let startD = (first.getDay() + 2) % 7;
        let html = `<div class="month-container"><h2 class="month-title">${months[m]}</h2><div class="grid">`;
        for(let h of daysOfWeek) html += `<div class="day-header">${h}</div>`;
        for(let i=0; i<startD; i++) html += `<div class="day empty"></div>`;
        for(let d = 1; d <= last.getDate(); d++) {
            const target = Date.UTC(year, m, d); const curr = new Date(target); const dStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            let pI = getPIndex(target); let shift = getShiftForCrew(pI, crew); let sC = shift;
            let lbl = shift === 'N' ? 'NIGHT' : (shift === 'D' ? 'DAY' : 'OFF'); let alt = ''; let next = getShiftForCrew((pI+1)%28, crew);
            
            let f = dayFatigue[dStr] || {}; 
            
            if (f.isLockout) { shift = 'O'; sC = 'O'; lbl = 'OFF'; }

            let ex = extraShifts[dStr], eH = '', oH = '', tH = ''; 
            let baseH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((shift === 'D' || shift === 'N') ? 12 : 0);
            
            if (ex) {
                if (ex.otHours > 0 || ex.dtHours > 0) {
                    let actualExtra = Math.max(0, (ex.startTime && ex.endTime ? getDuration(ex.startTime, ex.endTime) : 12) - baseH);
                    if (actualExtra <= 0.05) { ex.otHours = 0; ex.dtHours = 0; }
                }

                if (ex.type === 'Vacation') { 
                    if (ex.startTime && ex.endTime) { eH = `<div class="extra-shift" style="background:#00bcd4;color:#fff;">🏖️ Partial Vac</div>`; sC = 'M'; lbl = 'PARTIAL VAC'; 
                    } else { eH = `<div class="extra-shift" style="background:#00bcd4;color:#fff;">🏖️ Vacation</div>`; sC = 'O'; lbl = 'VACATION'; }
                }
                else if (ex.type === 'Off') { 
                    if (ex.startTime && ex.endTime) { eH = `<div class="extra-shift" style="background:var(--night);color:#fff;">🚫 Partial Off</div>`; sC = 'M'; lbl = 'PARTIAL OFF'; 
                    } else { eH = `<div class="extra-shift" style="background:var(--night);color:#fff;">🚫 Unpaid Off</div>`; sC = 'O'; lbl = 'ABSENT'; }
                }
                else if (ex.type === 'Lieu') { 
                    if (ex.startTime && ex.endTime) { eH = `<div class="extra-shift" style="background:#fbbc04;color:#000;">🏛️ Partial Lieu</div>`; sC = 'M'; lbl = 'PARTIAL LIEU'; 
                    } else { eH = `<div class="extra-shift" style="background:#fbbc04;color:#000;">🏛️ Lieu Day</div>`; sC = 'O'; lbl = 'LIEU DAY'; }
                }
                else if (ex.type === 'DropOff') { eH = `<div class="extra-shift" style="background:var(--day);color:#fff;">💧 Drop Day</div>`; sC = 'O'; lbl = 'DROP OFF'; }
                else if (ex.type === 'DropPaid') { eH = `<div class="extra-shift" style="background:var(--off);color:#fff;">💰 Drop (Paid)</div>`; sC = 'M'; lbl = 'DROP PAID'; }
                
                if (!['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex.type)) {
                    if (ex.type && ex.crew && ex.type !== 'DropPaid') { eH = `<div class="extra-shift">${formatCrewLabel(ex.crew)} ${ex.type === 'Day' ? '☀️' : '🌙'}</div>`; sC = 'M'; lbl = ex.type === 'Day' ? 'DAY' : 'NIGHT'; }
                    
                    let displayOT = ex.otHours || 0;
                    let displayDT = ex.dtHours || 0;
                    if (ex.type === 'DropPaid' && !ex.otHours && !ex.dtHours && (!ex.startTime || !ex.endTime)) {
                        displayOT = 12.0;
                    }

                    if (displayOT > 0.05) oH += `<div class="ot-badge">+${displayOT.toFixed(1)} OT</div>`; 
                    if (displayDT > 0.05) oH += `<div class="ot-badge dt">+${displayDT.toFixed(1)} DT</div>`;
                    
                    if (ex.startTime && ex.endTime) {
                        let dur = getDuration(ex.startTime, ex.endTime); let short = Math.max(0, baseH - dur);
                        if (short > 0.05) {
                            let vH = ex.vacHours || 0; let uH = Math.max(0, short - vH);
                            if (uH > 0.05) oH += `<div class="ot-badge unpaid">-${uH.toFixed(1)}h UNPAID</div>`;
                            if (vH > 0.05) oH += `<div class="ot-badge" style="background:#00bcd4;color:#fff;">+${vH.toFixed(1)}h VAC</div>`;
                        }
                    }
                    if (oH) oH = `<div class="ot-container">${oH}</div>`;
                    if (ex.startTime || ex.endTime) tH = `<div class="shift-times">${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}</div>`;
                } else if (ex.startTime && ex.endTime) { tH = `<div class="shift-times">${formatTime12(ex.startTime)} - ${formatTime12(ex.endTime)}</div>`; }
            }
            
            let holInfo = yearHols[dStr];
            if (holInfo) {
                eH += `<div class="hol-badge">⭐ ${holInfo.n}</div>`;
            }
            
            if (f.isDropPeriod) { sC += ' drop-period'; if (f.ppDayIndex === 0) alt += `<div class="drop-badge">💧 DROP</div>`; }
            let ppB = f.isPPBoundary ? `<div class="btn-pp-end" onclick="event.stopPropagation(); triggerBiometricsAndOpenPay(${f.ppIndex})">💰 View PP Log</div>` : '';
            if (f.isLockout && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(ex?.type)) { sC += ' lockout'; eH += `<div class="lockout-badge">❌ 120H MAX</div>`; }
            
            let isToday = (dStr === todayStr); 
            let isPast = (dStr < todayStr);
            let isCurrentPP = (f.ppIndex === currentTargetPPIndex); 
            let timeC = isToday ? 'today' : (isPast ? (isCurrentPP ? 'current-pp' : 'past') : (isCurrentPP ? 'current-pp' : ''));
            
            html += `<div class="day ${sC} ${timeC}" id="day-${dStr}" onclick="haptic(); openPickupSheet('${dStr}', '${months[m]} ${d}, ${year}', '${getShiftForCrew(pI, crew)}', '${next}')">${d}${alt}${oH}<div class="label">${lbl}</div>${tH}${eH}${ppB}</div>`;
        }
        fullCalendarHtml += html + `</div></div>`;
    }
    cal.innerHTML = fullCalendarHtml;
    setTimeout(scrollToToday, 200);
}

function scrollToToday() { const el = document.querySelector('.day.today'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function updateSliderLabels() {
    let slider = document.getElementById('ot-slider'); 
    if(!slider) return;
    slider.setAttribute('data-user-modified', 'true');
    let dt = parseFloat(slider.value) || 0; let extra = parseFloat(slider.max) || 0;
    
    let otLabel = document.getElementById('lbl-slider-ot');
    if(otLabel) otLabel.innerText = Math.max(0, extra - dt).toFixed(1) + 'h';
    
    let dtLabel = document.getElementById('lbl-slider-dt');
    if(dtLabel) dtLabel.innerText = dt.toFixed(1) + 'h';
}

function updateShortSliderLabels() {
    let slider = document.getElementById('short-slider'); 
    if(!slider) return;
    slider.setAttribute('data-user-modified', 'true');
    let vH = parseFloat(slider.value) || 0; let short = parseFloat(slider.max) || 0;
    
    let vacLabel = document.getElementById('lbl-slider-vac');
    if(vacLabel) vacLabel.innerText = vH.toFixed(1) + 'h';
    
    let unpaidLabel = document.getElementById('lbl-slider-unpaid');
    if(unpaidLabel) unpaidLabel.innerText = Math.max(0, short - vH).toFixed(1) + 'h';
    
    updatePickupToggles(true); 
}

function openPickupSheet(dStr, disp, curS, nextS) {
    activeDate = dStr; activeCurrentShift = curS; activeNextShift = nextS; 
    let sheetDate = document.getElementById('sheet-date');
    if(sheetDate) sheetDate.innerText = disp;
    
    let ex = extraShifts[dStr] || {}; let targetType = ex.type || curS; let defS = '', defE = '';
    
    if (targetType === 'Day' || targetType === 'D') { defS = '06:30'; defE = '18:30'; } 
    else if (targetType === 'Night' || targetType === 'N') { defS = '18:30'; defE = '06:30'; }
    else if (targetType === 'DropPaid') { defS = (curS === 'N') ? '18:30' : '06:30'; defE = (curS === 'N') ? '06:30' : '18:30'; }

    if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(targetType) || (targetType === 'O' && selectedType !== 'DropPaid')) {
        defS = ''; defE = ''; 
    }
    
    let regRoleBtn = document.getElementById('btn-role-Reg');
    if(regRoleBtn) regRoleBtn.innerText = `Regular ($${sysSettings.regRate.toFixed(2)})`;
    
    let tlRoleBtn = document.getElementById('btn-role-TL');
    if(tlRoleBtn) tlRoleBtn.innerText = `Team Leader ($${sysSettings.tlRate.toFixed(2)})`;
    
    selectedType = ex.type || null; 
    selectedCrew = normalizeCrew(ex.crew) || null; 
    
    selectedRole = ex.role || sysSettings.defaultRole || 'Reg'; 
    let manualInput = document.getElementById('manual-rate-input');
    if (manualInput) {
        if (selectedRole === 'Manual') {
            manualInput.style.display = 'block';
            manualInput.value = ex.manualRate || '';
        } else {
            manualInput.style.display = 'none';
            manualInput.value = '';
        }
    }

    let stInput = document.getElementById('input-start-time');
    if(stInput) stInput.value = ex.startTime || defS; 
    
    let etInput = document.getElementById('input-end-time');
    if(etInput) etInput.value = ex.endTime || defE;
    
    let otSlider = document.getElementById('ot-slider'); 
    if (otSlider) {
        otSlider.removeAttribute('data-user-modified');
        if (ex.dtHours !== undefined) otSlider.dataset.savedDt = ex.dtHours; else delete otSlider.dataset.savedDt;
    }

    let shortSlider = document.getElementById('short-slider'); 
    if (shortSlider) {
        shortSlider.removeAttribute('data-user-modified');
        if (ex.vacHours !== undefined) shortSlider.dataset.savedVac = ex.vacHours; else delete shortSlider.dataset.savedVac;
    }

    let cbOverride = document.getElementById('cb-override');
    if(cbOverride) cbOverride.checked = ex.overrideLockout || false; 
    
    let rInput = document.getElementById('input-ot-reason');
    if (rInput) rInput.value = ex.otReason || '';
    
    updatePickupToggles();
    
    let btnRemove = document.getElementById('btn-remove');
    if(btnRemove) btnRemove.style.display = Object.keys(ex).length ? 'block' : 'none'; 
    openSheet('sheet-pickup');
}

function quickLog(template) {
    haptic();
    let stInput = document.getElementById('input-start-time');
    let etInput = document.getElementById('input-end-time');
    
    let baseS = (activeCurrentShift === 'D' || activeCurrentShift === 'Day') ? '06:30' : (activeCurrentShift === 'N' || activeCurrentShift === 'Night' ? '18:30' : '06:30');
    
    if (template === 'early4') {
        if(baseS === '06:30') { stInput.value = '02:30'; etInput.value = '18:30'; }
        else { stInput.value = '14:30'; etInput.value = '06:30'; }
    } else if (template === 'late4') {
        if(baseS === '06:30') { stInput.value = '06:30'; etInput.value = '22:30'; }
        else { stInput.value = '18:30'; etInput.value = '10:30'; }
    } else if (template === 'vacation') {
        selectType('Vacation');
        return;
    }
    
    if (['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        selectedType = null;
    }
    resetSliders();
    updatePickupToggles();
}

function selectRole(r) { 
    haptic();
    selectedRole = r; 
    let manualInput = document.getElementById('manual-rate-input');
    if (manualInput) {
        manualInput.style.display = (r === 'Manual') ? 'block' : 'none';
    }
    updatePickupToggles(); 
}

function selectType(t) { 
    haptic();
    selectedType = (selectedType === t) ? null : t; 
    let stInput = document.getElementById('input-start-time');
    let etInput = document.getElementById('input-end-time');
    
    if (selectedType === 'Day') { 
        if(stInput) stInput.value = '06:30'; 
        if(etInput) etInput.value = '18:30'; 
    } 
    else if (selectedType === 'Night') { 
        if(stInput) stInput.value = '18:30'; 
        if(etInput) etInput.value = '06:30'; 
    } 
    else if (['DropOff', 'Vacation', 'Off', 'Lieu'].includes(selectedType)) { 
        if(stInput) stInput.value = ''; 
        if(etInput) etInput.value = ''; 
        let rInput = document.getElementById('input-ot-reason');
        if(rInput) rInput.value = '';
        selectedCrew = null;
    } 
    else if (selectedType === 'DropPaid') {
        if (activeCurrentShift === 'N') { 
            if(stInput) stInput.value = '18:30'; 
            if(etInput) etInput.value = '06:30'; 
        } else { 
            if(stInput) stInput.value = '06:30'; 
            if(etInput) etInput.value = '18:30'; 
        }
    }
    else {
        if (activeCurrentShift === 'D') { 
            if(stInput) stInput.value = '06:30'; 
            if(etInput) etInput.value = '18:30'; 
        } else if (activeCurrentShift === 'N') { 
            if(stInput) stInput.value = '18:30'; 
            if(etInput) etInput.value = '06:30'; 
        } else { 
            if(stInput) stInput.value = ''; 
            if(etInput) etInput.value = ''; 
        }
    }
    resetSliders(); updatePickupToggles(); 
}

function selectCrew(c) { haptic(); selectedCrew = (selectedCrew === c) ? null : c; updatePickupToggles(); }
function addMorningMeeting() { 
    haptic();
    let et = document.getElementById('input-end-time'); 
    if(et) {
        if (!et.value) { let exp = selectedType || activeCurrentShift; et.value = (exp === 'Day' || exp === 'D') ? '18:30' : '06:30'; } 
        let [h, m] = et.value.split(':').map(Number); et.value = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; 
    }
    let otSlider = document.getElementById('ot-slider');
    if(otSlider) otSlider.removeAttribute('data-user-modified'); 
    updatePickupToggles(); 
}

const TIMEOFF_GLOWS = {
    Vacation: '0 4px 10px rgba(0, 188, 212, 0.3)',
    Off:      '0 4px 10px rgba(234, 67, 53, 0.3)',
    Lieu:     '0 4px 10px rgba(251, 188, 4, 0.3)',
    DropOff:  '0 4px 10px rgba(66, 133, 244, 0.3)',
    DropPaid: '0 4px 10px rgba(52, 168, 83, 0.3)'
};

function updatePickupToggles(skipSliderReset = false) {
    document.querySelectorAll('#sheet-pickup .toggle-btn').forEach(b => b.classList.remove('active'));
    
    let f = dayFatigue[activeDate];
    let isDropPeriod = f && f.isDropPeriod;
    
    let activePP = f ? f.ppIndex : 0;
    let offset = (((activePP % 3) + 3) % 3);
    let startPP = activePP - (offset === 1 ? 2 : (offset === 2 ? 0 : 1));
    
    let hasDropOffInCycle = false, hasAbsenceInCycle = false, hasDropPaidInCycle = false;
    let cycleStartUTC = basePPStartUTC + startPP * 1209600000;
    let cycleEndUTC = basePPStartUTC + (startPP + 3) * 1209600000;

    for (let u = cycleStartUTC; u < cycleEndUTC; u += 86400000) {
        let c = new Date(u); let dS = `${c.getUTCFullYear()}-${String(c.getUTCMonth()+1).padStart(2,'0')}-${String(c.getUTCDate()).padStart(2,'0')}`;
        if (dS !== activeDate && extraShifts[dS]) {
            if (extraShifts[dS].type === 'DropOff') hasDropOffInCycle = true;
            if (extraShifts[dS].type === 'Off' || extraShifts[dS].type === 'DropOff' || extraShifts[dS].type === 'Lieu') hasAbsenceInCycle = true;
            if (extraShifts[dS].type === 'DropPaid') hasDropPaidInCycle = true;
        }
    }

    let btnDropPaid = document.getElementById('btn-type-DropPaid'); let btnDropOff = document.getElementById('btn-type-DropOff');
    if (btnDropPaid && btnDropOff) { btnDropOff.style.display = 'block'; btnDropPaid.style.display = isDropPeriod ? 'block' : 'none'; }

    if (selectedType && ['Day', 'Night'].includes(selectedType)) { let btn = document.getElementById('btn-type-' + selectedType); if (btn) btn.classList.add('active'); }
    if (selectedCrew) { let btn = document.getElementById('btn-crew-' + selectedCrew); if (btn) btn.classList.add('active'); }
    
    let activeRoleBtn = document.getElementById('btn-role-' + selectedRole);
    if(activeRoleBtn) activeRoleBtn.classList.add('active');
    
    let isTimeOff = ['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType);
    let crewOverrideContainer = document.getElementById('crew-override-container');
    if (crewOverrideContainer) crewOverrideContainer.style.display = isTimeOff ? 'none' : 'block';

    ['Vacation', 'Off', 'DropOff', 'DropPaid', 'Lieu'].forEach(t => {
        let btn = document.getElementById('btn-type-' + t);
        if(!btn) return;
        if (selectedType === t) {
            btn.classList.add('active');
            if(t === 'Vacation') btn.style.background = 'rgba(0, 188, 212, 0.2)';
            if(t === 'Off') btn.style.background = 'rgba(234, 67, 53, 0.2)';
            if(t === 'Lieu') btn.style.background = 'rgba(251, 188, 4, 0.2)';
            if(t === 'DropOff') btn.style.background = 'rgba(66, 133, 244, 0.2)';
            if(t === 'DropPaid') btn.style.background = 'rgba(52, 168, 83, 0.2)';
            btn.style.boxShadow = TIMEOFF_GLOWS[t];
        } else {
            btn.style.background = 'var(--input-bg)';
            btn.style.boxShadow = '';
        }
    });

    let wT = document.getElementById('conflict-text'), ovL = document.getElementById('override-label'), bS = document.getElementById('btn-save');
    if(wT) wT.innerHTML = ''; 
    if(ovL) ovL.style.display = 'none'; 
    let hasW = false, canS = true;

    let stInput = document.getElementById('input-start-time');
    let etInput = document.getElementById('input-end-time');
    let st = stInput ? stInput.value : '';
    let et = etInput ? etInput.value : '';

    if (selectedType === 'Vacation') {
        let crewSelect = document.getElementById('crew-select');
        let viewCrew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        let ytdVacation = getUsedVacationHours(viewCrew, activeDate, activeDate);
        
        let base = f ? f.baseWorkHours : 0; if(base === 0 && (!st || !et)) base = 12;
        let dur = (st && et) ? getDuration(st, et) : 0; let vH = (st && et) ? Math.max(0, base - dur) : base;

        if (ytdVacation + vH > sysSettings.vacationLimit + 0.05) {
            let hrsLeft = Math.max(0, sysSettings.vacationLimit - ytdVacation);
            if(wT) wT.innerHTML += `⚠️ VACATION LIMIT: Cannot book. You only have ${hrsLeft.toFixed(1)} hours remaining for this cycle.<br>`;
            hasW = true; canS = false;
        }
    }

    if (selectedType === 'Lieu') {
        let crewSelect = document.getElementById('crew-select');
        let viewCrew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        let banked = computeLieuBalance(activeDate, viewCrew, activeDate);
        if (banked <= 0) {
            if(wT) wT.innerHTML += `⚠️ LIEU DAY LIMIT: You have no banked Lieu Days available (current balance: ${banked}).<br>`;
            hasW = true; canS = false;
        }
    }

    if (selectedType === 'DropOff' && hasDropOffInCycle) { if(wT) wT.innerHTML += `⚠️ DROP OFF LIMIT: You already took a Drop Off Day in this 6-week cycle.<br>`; hasW = true; canS = false; }
    if (selectedType === 'DropPaid') {
        if (hasDropPaidInCycle) { if(wT) wT.innerHTML += `⚠️ DROP PAID LIMIT: You already logged a Drop Paid shift in this cycle.<br>`; hasW = true; canS = false; }
        if (hasAbsenceInCycle) { if(wT) wT.innerHTML += `⚠️ DROP PAID BLOCKED: You have an Unpaid Absence logged in this eligibility cycle.<br>`; hasW = true; canS = false; }
    }
    
    if (st && et && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        let currentStart = getFloatTime(st);
        let currentEnd = getFloatTime(et); if (currentEnd < currentStart) currentEnd += 24;
        let dateObj = new Date(activeDate + "T00:00:00Z");
        let crewSelect = document.getElementById('crew-select');
        let crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        
        let yDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate() - 1));
        let yStr = `${yDate.getUTCFullYear()}-${String(yDate.getUTCMonth()+1).padStart(2,'0')}-${String(yDate.getUTCDate()).padStart(2,'0')}`;
        let yEnd = getShiftEndFloat(yStr, crew);
        if (yEnd !== null) {
            let restBack = (currentStart + 24) - yEnd;
            if (restBack < 7.95) { 
                if(wT) wT.innerHTML += `🚨 INSUFFICIENT REST: Only ${restBack.toFixed(1)}h rest since yesterday's shift.<br>`; 
                if(ovL) ovL.style.display='flex'; 
                let cbOv = document.getElementById('cb-override');
                if(!cbOv || !cbOv.checked) canS=false; 
            }
        }

        let tDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate() + 1));
        let tStr = `${tDate.getUTCFullYear()}-${String(tDate.getUTCMonth()+1).padStart(2,'0')}-${String(tDate.getUTCDate()).padStart(2,'0')}`;
        let tStart = getShiftStartFloat(tStr, crew);
        if (tStart !== null) {
            let restFwd = (tStart + 24) - currentEnd;
            if (restFwd < 7.95) { 
                if(wT) wT.innerHTML += `🚨 INSUFFICIENT REST: Only ${restFwd.toFixed(1)}h rest before tomorrow's shift.<br>`; 
                if(ovL) ovL.style.display='flex'; 
                let cbOv = document.getElementById('cb-override');
                if(!cbOv || !cbOv.checked) canS=false; 
            }
        }
    }

    if (activeCurrentShift === 'O' && activeNextShift !== 'O' && ['Day', 'Night'].includes(selectedType)) { 
        if (activeNextShift === 'N' && selectedType === 'Day') { if(wT) wT.innerHTML += "⚠️ SLEEP WARNING: Nights tomorrow!<br>"; hasW = true; } 
        else if (activeNextShift === 'D' && selectedType === 'Night') { if(wT) wT.innerHTML += "⚠️ SLEEP WARNING: Days tomorrow!<br>"; hasW = true; } 
    }
    
    let base = f ? f.baseWorkHours : 0;
    let cbOv = document.getElementById('cb-override');
    if (f && f.isLockout && cbOv && cbOv.checked) {
        base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    }
    
    if (['DropPaid', 'DropOff', 'Lieu'].includes(selectedType)) base = 0;

    let dur = (st && et) ? getDuration(st, et) : 0;
    let extra = Math.max(0, dur - base); let short = Math.max(0, base - dur);
    
    let otS = document.getElementById('section-ot-rate'), slider = document.getElementById('ot-slider');
    let shortS = document.getElementById('section-short-shift'), shortSlider = document.getElementById('short-slider');

    function setShortShiftMode(mode, html = '') {
        if (!shortS) return;
        let msgBox = document.getElementById('short-shift-msgbox');
        if (!msgBox) {
            msgBox = document.createElement('div');
            msgBox.id = 'short-shift-msgbox';
            shortS.appendChild(msgBox);
        }
        if (mode === 'message') {
            Array.from(shortS.children).forEach(c => { if(c.id !== 'short-shift-msgbox') c.style.display = 'none'; });
            msgBox.style.display = 'block';
            msgBox.innerHTML = html;
        } else if (mode === 'slider') {
            Array.from(shortS.children).forEach(c => { if(c.id !== 'short-shift-msgbox') c.style.display = ''; });
            msgBox.style.display = 'none';
        }
    }

    if (selectedType === 'Vacation') {
        if(shortS) {
            shortS.style.display = 'block'; shortS.style.background = 'rgba(0, 188, 212, 0.1)'; shortS.style.borderColor = 'rgba(0, 188, 212, 0.3)';
        }
        let vH = (st && et) ? short : base; if(vH === 0 && (!st || !et)) vH = 12;
        setShortShiftMode('message', `<div class="sheet-label" style="color: #00bcd4; margin-bottom: 0;">🏖️ ${vH.toFixed(1)} hours logged as Vacation</div>`);
    } else if (selectedType === 'Off') {
        if(shortS) {
            shortS.style.display = 'block'; shortS.style.background = 'rgba(234, 67, 53, 0.1)'; shortS.style.borderColor = 'rgba(234, 67, 53, 0.3)';
        }
        let uH = (st && et) ? short : base; if(uH === 0 && (!st || !et)) uH = 12;
        setShortShiftMode('message', `<div class="sheet-label" style="color: var(--night); margin-bottom: 0;">⚠️ ${uH.toFixed(1)} hours logged as Unpaid</div>`);
    } else if (selectedType === 'Lieu') {
        if(shortS) {
            shortS.style.display = 'block'; shortS.style.background = 'rgba(251, 188, 4, 0.1)'; shortS.style.borderColor = 'rgba(251, 188, 4, 0.3)';
        }
        let uH = (st && et) ? short : base; if(uH === 0 && (!st || !et)) uH = 12;
        setShortShiftMode('message', `<div class="sheet-label" style="color: #fbbc04; margin-bottom: 0;">🏛️ ${uH.toFixed(1)} hours logged as Lieu Day</div>`);
    } else if (short > 0.05 && dur > 0 && selectedType !== 'DropPaid') {
        if(shortS) {
            shortS.style.display = 'block'; shortS.style.background = 'var(--card)'; shortS.style.borderColor = 'var(--border)';
        }
        setShortShiftMode('slider');
        let dsh = document.getElementById('display-short-hours');
        if(dsh) dsh.innerText = short.toFixed(1);
        
        if (shortSlider) {
            shortSlider.max = short;
            if (!skipSliderReset) {
                if (shortSlider.dataset.savedVac !== undefined) { shortSlider.value = shortSlider.dataset.savedVac; shortSlider.setAttribute('data-user-modified', 'true'); delete shortSlider.dataset.savedVac; }
                else if (!shortSlider.hasAttribute('data-user-modified')) { shortSlider.value = 0; }
                else if (parseFloat(shortSlider.value) > short) { shortSlider.value = short; }
            }
            let vH = parseFloat(shortSlider.value) || 0; let uH = short - vH;
            let lsv = document.getElementById('lbl-slider-vac');
            if(lsv) lsv.innerText = vH.toFixed(1) + 'h'; 
            let lsu = document.getElementById('lbl-slider-unpaid');
            if(lsu) lsu.innerText = uH.toFixed(1) + 'h';
        }
    } else {
        if(shortS) shortS.style.display = 'none';
    }

    if (extra > 0.05 && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) { 
        if(otS) otS.style.display = 'block'; 
        let deh = document.getElementById('display-extra-hours');
        if(deh) deh.innerText = extra.toFixed(1); 
        
        if (slider) {
            slider.max = extra;
            if (!skipSliderReset) {
                if (slider.dataset.savedDt !== undefined) { slider.value = slider.dataset.savedDt; slider.setAttribute('data-user-modified', 'true'); delete slider.dataset.savedDt; }
                else if (!slider.hasAttribute('data-user-modified')) { slider.value = (selectedType === 'DropPaid') ? 0 : extra; }
                else if (parseFloat(slider.value) > extra) { slider.value = extra; }
            }
            let dt = parseFloat(slider.value) || 0; let ot = Math.max(0, extra - dt);
            let lso = document.getElementById('lbl-slider-ot');
            if(lso) lso.innerText = ot.toFixed(1) + 'h'; 
            let lsd = document.getElementById('lbl-slider-dt');
            if(lsd) lsd.innerText = dt.toFixed(1) + 'h';
        }
    } else { 
        if(otS) otS.style.display='none'; 
        if (!skipSliderReset && slider) slider.removeAttribute('data-user-modified');
    }
    
    if (f && !['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType)) {
        let crewSelect = document.getElementById('crew-select');
        let viewC = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
        let ppStart = basePPStartUTC + f.ppIndex * 1209600000, proj = 0;
        for(let d=0; d<=13; d++) {
            let u = ppStart + d*86400000, dS = new Date(u).toISOString().split('T')[0];
            if(dS === activeDate) proj += dur;
            else proj += (dayFatigue[dS]?.scheduledWorkHours || 0);
        }
        if (proj > 120.05) { 
            if(wT) wT.innerHTML += `🚨 120H LIMIT: Projected ${proj.toFixed(1)}h.<br>`; 
            if(ovL) ovL.style.display='flex'; 
            if(!cbOv || !cbOv.checked) canS=false; 
        }
    }

    let cw = document.getElementById('conflict-warning');
    if(cw) cw.style.display = (wT && wT.innerHTML) ? 'block' : 'none'; 
    if(bS) {
        bS.disabled = !canS; 
        bS.style.opacity = canS ? '1' : '0.5'; 
        bS.style.pointerEvents = canS ? 'auto' : 'none';
    }
}

function saveShift() {
    haptic();
    let isTimeOff = ['Vacation', 'Off', 'DropOff', 'Lieu'].includes(selectedType);
    let payload = { role: selectedRole };
    
    if (selectedRole === 'Manual') {
        let manualInput = document.getElementById('manual-rate-input');
        let mRate = manualInput ? parseFloat(manualInput.value) : 0;
        if (mRate > 0) payload.manualRate = mRate;
    }

    let stInput = document.getElementById('input-start-time');
    let etInput = document.getElementById('input-end-time');
    let st = stInput ? stInput.value : '';
    let et = etInput ? etInput.value : '';
    
    if (st && et) { payload.startTime = st; payload.endTime = et; }
    if (selectedType) payload.type = selectedType; 

    let cbOv = document.getElementById('cb-override');
    let base = dayFatigue[activeDate] ? dayFatigue[activeDate].baseWorkHours : 0;
    if (dayFatigue[activeDate] && dayFatigue[activeDate].isLockout && cbOv && cbOv.checked) {
        base = (activeCurrentShift === 'D' || activeCurrentShift === 'N') ? 12 : 0;
    }

    if (['DropPaid', 'DropOff', 'Lieu'].includes(selectedType)) base = 0;
    let dur = (st && et) ? getDuration(st, et) : 0;
    
    if (selectedType === 'DropPaid' && dur === 0) {
        dur = 12;
    }
    
    let extra = Math.max(0, dur - base);
    let short = Math.max(0, base - dur);

    if (selectedType === 'Vacation') {
        payload.vacHours = (dur === 0) ? (base === 0 ? 12 : base) : short;
    } else {
        if (short > 0.05 && selectedType !== 'DropPaid' && selectedType !== 'Lieu') {
            let shortSlider = document.getElementById('short-slider');
            let vH = shortSlider ? (parseFloat(shortSlider.value) || 0) : 0;
            if (vH > 0) payload.vacHours = vH;
        }
        
        if (!['Off', 'DropOff', 'Lieu'].includes(selectedType)) {
            let otSlider = document.getElementById('ot-slider');
            let dtH = otSlider ? (parseFloat(otSlider.value) || 0) : 0;
            let otH = Math.max(0, extra - dtH);

            if (extra > 0.05) { 
                payload.otHours = otH; 
                payload.dtHours = dtH; 
                let rInput = document.getElementById('input-ot-reason');
                if (rInput && rInput.value.trim() !== '') {
                    payload.otReason = rInput.value.trim();
                }
            }
            if (selectedCrew) payload.crew = selectedCrew;
        }
    }
    if (cbOv && cbOv.checked) payload.overrideLockout = true;

    extraShifts[activeDate] = payload; 
    localStorage.setItem('kingDrewShiftsV20', JSON.stringify(extraShifts)); 
    
    updateNotifications(); 
    closeAllSheets(); 
    showToast('Shift Saved');
}

function safeSingleDaySync(dStr) {
    let crew = sysSettings.defaultCrew;
    let pI = getPIndex(Date.UTC(dStr.substring(0,4), dStr.substring(5,7)-1, dStr.substring(8,10)));
    let bS = getShiftForCrew(pI, crew);
    let ex = extraShifts[dStr];
    let f = dayFatigue[dStr] || {};
    
    let sTime = null;
    let eTime = null;
    let isOff = false;
    
    if (ex) {
        if (['Off', 'DropOff', 'Vacation', 'Lieu'].includes(ex.type) && (!ex.startTime || !ex.endTime)) {
            isOff = true; 
        } else if (ex.startTime) {
            sTime = ex.startTime;
            eTime = ex.endTime;
        } else if (ex.type === 'DropPaid') {
            isOff = true;
        } else if (ex.type === 'Day') {
            sTime = '06:30';
            eTime = '18:30';
        } else if (ex.type === 'Night') {
            sTime = '18:30';
            eTime = '06:30';
        }
    } 
    
    if (!sTime && !isOff && !ex) {
        if (bS === 'D') {
            sTime = '06:30';
            eTime = '18:30';
        } else if (bS === 'N') {
            sTime = '18:30';
            eTime = '06:30';
        } else if (bS === 'O') {
            isOff = true;
        }
    }

    if (f.isLockout && (!ex || !ex.overrideLockout)) {
        isOff = true;
    }

    let [y, m, d] = dStr.split('-').map(Number);
    let start, end;
    let title = "";

    if (isOff) {
        start = new Date(y, m - 1, d, 0, 0, 0);
        end = new Date(y, m - 1, d, 23, 59, 59);
        title = "OFF SHIFT";
    } else {
        let [sh, smin] = sTime ? sTime.split(':').map(Number) : [0,0];
        start = new Date(y, m - 1, d, sh, smin, 0);
        
        let dur = getDuration(sTime || "06:30", eTime || "18:30");
        end = new Date(start.getTime() + (dur * 3600000));
        
        let shiftName = (sh >= 12) ? 'NIGHT SHIFT' : 'DAY SHIFT';
        if (ex && ex.type === 'Day') shiftName = 'DAY SHIFT';
        if (ex && ex.type === 'Night') shiftName = 'NIGHT SHIFT';
        
        title = shiftName;
        
        if (ex && ex.crew && ex.crew !== sysSettings.defaultCrew) {
            if (/^[A-D]$/.test(ex.crew)) {
                title += ` (${ex.crew}-SHIFT)`;
            } else if (ex.crew === 'OT') {
                title += ` (OT)`;
            } else {
                title += ` (${ex.crew})`;
            }
        }
    }
    
    let oldSync = syncedEvents[dStr];

    function createNewEvent() {
        window.plugins.calendar.createEvent(title, 'Plant', 'Auto-synced by Shift Hub', start, end, function(){ 
            syncedEvents[dStr] = { title: title, start: start.getTime(), end: end.getTime() };
            localStorage.setItem('kingDrewSyncedEventsV20', JSON.stringify(syncedEvents));
            renderCalendar(); 
        }, function(){ renderCalendar(); });
    }

    if (oldSync) {
        window.plugins.calendar.deleteEvent(oldSync.title, 'Plant', 'Auto-synced by Shift Hub', new Date(oldSync.start), new Date(oldSync.end), function() {
            delete syncedEvents[dStr];
            localStorage.setItem('kingDrewSyncedEventsV20', JSON.stringify(syncedEvents));
            createNewEvent();
        }, function() {
            delete syncedEvents[dStr];
            localStorage.setItem('kingDrewSyncedEventsV20', JSON.stringify(syncedEvents));
            createNewEvent();
        });
    } else {
        createNewEvent();
    }
}

function handleCalendarSyncAndRender() {
    if (sysSettings.syncCalendar && window.plugins && window.plugins.calendar && activeDate) {
        window.plugins.calendar.hasReadWritePermission(function(hasPerm) {
            if (!hasPerm) {
                window.plugins.calendar.requestReadWritePermission(function() {
                    safeSingleDaySync(activeDate);
                }, function() {
                    showToast('Calendar Permission Denied', 'error');
                    renderCalendar();
                });
            } else {
                safeSingleDaySync(activeDate);
            }
        });
    } else {
        renderCalendar();
    }
}

function removeShift() { 
    haptic(); 
    delete extraShifts[activeDate]; 
    localStorage.setItem('kingDrewShiftsV20', JSON.stringify(extraShifts)); 
    updateNotifications(); 
    closeAllSheets(); 
    showToast('Shift Removed', 'error'); 
}

function triggerBiometricsAndOpenPay(target = null) {
    haptic();
    if (sysSettings.useBiometrics && window.Fingerprint) {
        window.Fingerprint.isAvailable(
            function(isAvailableSuccess) {
                window.Fingerprint.show({
                    title: "Authentication Required",
                    description: "Unlock to view financial data"
                }, () => openPayrollSheet(target), () => showToast("Authentication Failed", "error"));
            },
            function(isAvailableError) {
                showToast("Biometrics not setup on this device", "error");
                openPayrollSheet(target); 
            }
        );
    } else {
        openPayrollSheet(target);
    }
}

function renderChart(reg, ot, dt, vac, lieu, hol) {
    const ctx = document.getElementById('payChart');
    const wrapper = document.getElementById('chart-wrapper');
    if(!ctx || !window.Chart) { if(wrapper) wrapper.style.display = 'none'; return; }
    
    wrapper.style.display = 'block';
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Reg', 'OT', 'DT', 'Vac', 'Lieu', 'Hol'],
            datasets: [{
                label: 'Hours',
                data: [reg, ot, dt, vac, lieu, hol],
                backgroundColor: ['#4ba3e3', '#34a853', '#ff6d00', '#00bcd4', '#fbbc04', '#ea4335'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.2)' }, ticks: { color: 'rgba(128,128,128,0.8)' } }, 
                x: { grid: { display: false }, ticks: { color: 'rgba(128,128,128,0.8)' } } 
            }
        }
    });
}

// Global Variables for the Simulator
let simBaseGross = 0;
let simTargetYear = 2026;
let simTargetPP = 0;

function runSimulator() {
    let otSlider = document.getElementById('sim-ot-slider');
    let dtSlider = document.getElementById('sim-dt-slider');
    if (!otSlider || !dtSlider) return;

    let otHrs = parseFloat(otSlider.value) || 0;
    let dtHrs = parseFloat(dtSlider.value) || 0;

    document.getElementById('sim-ot-val').innerText = otHrs.toFixed(1) + ' hrs';
    document.getElementById('sim-dt-val').innerText = dtHrs.toFixed(1) + ' hrs';

    let rate = sysSettings.regRate; 
    let extraGross = (otHrs * rate * 1.5) + (dtHrs * rate * 2.0);

    if (extraGross === 0) {
        document.getElementById('sim-gross').innerText = '+$0.00';
        document.getElementById('sim-tax').innerText = '-$0.00';
        document.getElementById('sim-net').innerText = '+$0.00';
        return;
    }

    let baseTaxes = calculateTaxes(simBaseGross, simTargetPP, simTargetYear);
    let newTaxes = calculateTaxes(simBaseGross + extraGross, simTargetPP, simTargetYear);

    let marginalTax = newTaxes.total - baseTaxes.total;
    let netBump = extraGross - marginalTax;

    document.getElementById('sim-gross').innerText = '+$' + extraGross.toFixed(2);
    document.getElementById('sim-tax').innerText = '-$' + marginalTax.toFixed(2);
    document.getElementById('sim-net').innerText = '+$' + netBump.toFixed(2);
}

function openPayrollSheet(target = null) {
    const crewSelect = document.getElementById('crew-select');
    const crew = crewSelect ? crewSelect.value : sysSettings.defaultCrew;
    const cont = document.getElementById('payroll-content');
    if(!cont) return;
    
    let logicalT = getLogicalToday();
    let nowUTC = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    if (target === null) target = Math.floor((nowUTC - basePPStartUTC) / 1209600000);
    
    let ppS = basePPStartUTC + target * 1209600000, ppE = ppS + 1123200000;
    let targetYear = new Date(ppE).getUTCFullYear();
    
    precalcFatigue(targetYear, crew);
    
    let regH = 0, vacH = 0, ot = 0, dt = 0, gross = 0, aftH = 0, nightH = 0, satH = 0, sunH = 0;
    let statOffH = 0, statWorked15H = 0, statWorked20H = 0, ppLieuTakenH = 0;
    
    let firstPP = 0;
    for (let i = target; i >= 0; i--) {
        let testE = basePPStartUTC + (i * 14 + 13) * 86400000;
        if (new Date(testE).getUTCFullYear() < targetYear) { firstPP = i + 1; break; }
        if (i === 0) firstPP = 0;
    }

    let ytdReg = 0, ytdOT = 0, ytdDT = 0, ytdVac = 0, ytdUnpaid = 0, ytdDropOff = 0;

    for (let i = firstPP; i <= target; i++) {
        let s = basePPStartUTC + i * 1209600000;
        for(let d = 0; d <= 13; d++) {
            let u = s + d*86400000, c = new Date(u), dS = `${c.getUTCFullYear()}-${String(c.getUTCMonth()+1).padStart(2,'0')}-${String(c.getUTCDate()).padStart(2,'0')}`;
            let bS = getShiftForCrew(getPIndex(u), crew), ex = extraShifts[dS], f = dayFatigue[dS] || {}; 
            let bH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);
            
            let act = bH, isVac = false;
            if (ex) {
                if (ex.type === 'DropOff') { act = 0; bH = 0; ytdDropOff += 12; } 
                else if (ex.type === 'DropPaid') { bH = 0; act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; } 
                else if (ex.type === 'Vacation') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; } 
                else if (ex.type === 'Off' || ex.type === 'Lieu') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; } 
                else if (ex.startTime && ex.endTime) { act = getDuration(ex.startTime, ex.endTime); } 
                else if (ex.type) { act = 12; }
            }
            if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') act = 0; 
            
            let dayR = Math.min(act, bH), dayE = Math.max(0, act - bH);
            ytdReg += dayR; 
            
            if (isVac) {
                let vacHours = ex.vacHours || Math.max(0, bH - act);
                if (!ex.vacHours && !(ex.startTime && ex.endTime)) vacHours = bH || 12;
                ytdVac += vacHours;
            } else if (act < bH && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') {
                ytdVac += ex.vacHours || 0;
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
    const ppEStr = `${ppEDate.getUTCFullYear()}-${String(ppEDate.getUTCMonth()+1).padStart(2,'0')}-${String(ppEDate.getUTCDate()).padStart(2,'0')}`;
    
    let totalCycleVac = getUsedVacationHours(crew, ppEStr);
    let vacRem = Math.max(0, sysSettings.vacationLimit - totalCycleVac);
    let currentCycle = getVacationCycle(ppEStr);
    
    const lieuAvailable = computeLieuBalance(ppEStr, crew, null);

    const cachedHols = {};

    for(let d = 0; d <= 13; d++) {
        let u = ppS + d*86400000, c = new Date(u), dS = `${c.getUTCFullYear()}-${String(c.getUTCMonth()+1).padStart(2,'0')}-${String(c.getUTCDate()).padStart(2,'0')}`;
        let bS = getShiftForCrew(getPIndex(u), crew), ex = extraShifts[dS], f = dayFatigue[dS] || {}; 
        let bH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);
        
        let act = bH, st = ex?.startTime || (bS === 'D' || ex?.type === 'Day' ? '06:30' : '18:30');
        let isVac = false, isLieu = false;
        
        if (ex) {
            if (ex.type === 'DropOff') { act = 0; bH = 0; } 
            else if (ex.type === 'DropPaid') { bH = 0; act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; } 
            else if (ex.type === 'Vacation') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; } 
            else if (ex.type === 'Off') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; } 
            else if (ex.type === 'Lieu') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isLieu = true; }
            else if (ex.startTime && ex.endTime) { act = getDuration(ex.startTime, ex.endTime); } 
            else if (ex.type) { act = 12; }
        }
        
        if (f.isLockout && !isVac && !isLieu && ex?.type !== 'Off' && ex?.type !== 'DropOff') act = 0; 
        
        let dayR = Math.min(act, bH), dayE = Math.max(0, act - bH);
        
        let rate = sysSettings.regRate;
        if (ex?.role === 'TL') rate = sysSettings.tlRate;
        else if (ex?.role === 'Manual' && ex?.manualRate) rate = ex.manualRate;

        regH += dayR; 
        
        if (isVac) {
            let vacHours = ex.vacHours || Math.max(0, bH - act);
            if (!ex.vacHours && !(ex.startTime && ex.endTime)) vacHours = bH || 12;
            vacH += vacHours; gross += (vacHours * rate);
        } else if (isLieu) {
            let lH = Math.max(0, bH - act);
            if (!ex.startTime && !ex.endTime) lH = bH || 12;
            ppLieuTakenH += lH;
        } else if (act < bH && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') {
            let vH = ex.vacHours || 0;
            vacH += vH; gross += (vH * rate);
        }
        
        if (!f.isLockout && act > 0) {
            let pD = calcPremiums(dS, st, dayR, rate); gross += (dayR * rate) + pD.total; aftH += pD.aftHrs; nightH += pD.nightHrs; satH += pD.satHrs; sunH += pD.sunHrs;
            if (dayE > 0) { 
                let sO = ex?.otHours || 0, sD = ex?.dtHours || 0; 
                if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                gross += (sO * rate * 1.5) + (sD * rate * 2.0); ot += sO; dt += sD; 
            }
        }

        let holYear = parseInt(dS.substring(0, 4));
        if (!cachedHols[holYear]) cachedHols[holYear] = getHolidays(holYear);
        let holInfo = cachedHols[holYear][dS];
        
        if (holInfo) {
            if (bH === 0 && !['Vacation', 'DropOff', 'Lieu', 'Off'].includes(ex?.type)) {
                statOffH += 8;
                gross += 8 * rate;
            }
            if (dayR > 0) {
                let shiftType = ex?.type || (bS === 'D' ? 'Day' : (bS === 'N' ? 'Night' : null));
                if (!shiftType && ex?.startTime) {
                    const startHr = parseInt(ex.startTime.split(':')[0]);
                    shiftType = (startHr >= 6 && startHr < 18) ? 'Day' : 'Night';
                }
                if (!shiftType) shiftType = 'Day';
                
                let holPremH = 0;
                if (shiftType === 'Day' || shiftType === 'D') {
                    holPremH = dayR; 
                } else if (shiftType === 'Night' || shiftType === 'N') {
                    holPremH = Math.min(dayR, 8); 
                }
                
                if (holInfo.m === 2.0) {
                    statWorked20H += holPremH;
                    gross += holPremH * rate * 1.0; 
                } else {
                    statWorked15H += holPremH;
                    gross += holPremH * rate * 0.5; 
                }
            }
        }
    }
    
    let t = calculateTaxes(gross, target, targetYear);
    
    // Inject the values into the Simulator Engine
    simBaseGross = gross;
    simTargetYear = targetYear;
    simTargetPP = target;
    let otS = document.getElementById('sim-ot-slider');
    let dtS = document.getElementById('sim-dt-slider');
    if (otS) otS.value = 0;
    if (dtS) dtS.value = 0;
    runSimulator();
    
    renderChart(regH, ot, dt, vacH, ppLieuTakenH, statOffH + statWorked15H + statWorked20H);

    let vacHtml = vacH > 0 ? `<div class="pp-stat-row"><span>Vacation:</span> <strong style="color: #00bcd4;">${vacH.toFixed(1)} hrs</strong></div>` : '';
    let lieuHtml = ppLieuTakenH > 0 ? `<div class="pp-stat-row"><span>Lieu Day (Unpaid):</span> <strong style="color: #fbbc04;">${ppLieuTakenH.toFixed(1)} hrs</strong></div>` : '';
    let statOffHtml = statOffH > 0 ? `<div class="pp-stat-row"><span>Holiday Pay (Unworked):</span> <strong style="color: #fbbc04;">${statOffH.toFixed(1)} hrs</strong></div>` : '';
    let stat15Html = statWorked15H > 0 ? `<div class="pp-stat-row"><span>Working Holiday (1.5x):</span> <strong style="color: #ff6d00;">${statWorked15H.toFixed(1)} hrs</strong></div>` : '';
    let stat20Html = statWorked20H > 0 ? `<div class="pp-stat-row"><span>Christmas Holiday (2.0x):</span> <strong style="color: var(--night);">${statWorked20H.toFixed(1)} hrs</strong></div>` : '';
    let lieuBankHtml = `<div class="pp-stat-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);"><span>Banked Lieu Days:</span> <strong style="color: #fbbc04;">${lieuAvailable} Avail</strong></div>`;

    cont.innerHTML = `
        <div class="pp-card active-pp" id="printable-paystub">
            <div class="pp-header"><span>${new Date(ppS).toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${new Date(ppE).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
            <div class="pp-stats">
                <div class="pp-stat-row"><span>Regular:</span> <strong>${regH.toFixed(1)} hrs</strong></div>
                ${vacHtml}
                ${lieuHtml}
                ${statOffHtml}
                ${stat15Html}
                ${stat20Html}
                ${lieuBankHtml}
                <div class="pp-stat-row" style="margin-top: 8px;"><span>OT (1.5x):</span> <strong style="color: #34a853;">${ot.toFixed(1)} hrs</strong></div>
                <div class="pp-stat-row"><span>DT (2.0x):</span> <strong style="color: #4285f4;">${dt.toFixed(1)} hrs</strong></div>
                <div class="pp-stat-row pp-total"><span>TOTAL:</span> <span>${(regH + vacH + ot + dt + statOffH).toFixed(1)} hrs</span></div>
            </div>
            
            <div class="pp-financials" style="margin-bottom: 15px; border-color: var(--border);">
                <div class="fin-section-title" style="margin-top: 0; color: var(--text-muted);">${targetYear} YTD Worked Hours</div>
                <div class="fin-row"><span>Regular:</span> <span style="font-weight: bold; color: var(--text);">${ytdReg.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Overtime (1.5x):</span> <span style="color: #34a853; font-weight: bold;">${ytdOT.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Double Time (2.0x):</span> <span style="color: #4285f4; font-weight: bold;">${ytdDT.toFixed(1)} hrs</span></div>
                <div class="fin-row" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px;"><span>Total Worked YTD:</span> <span style="color: var(--text); font-weight: bold;">${(ytdReg + ytdOT + ytdDT).toFixed(1)} hrs</span></div>
                
                <div class="fin-section-title" style="margin-top: 15px; color: var(--text-muted);">Cycle Absences (${currentCycle.start} to ${currentCycle.end})</div>
                <div class="fin-row"><span>Remaining Vacation:</span> <span style="color: #00bcd4; font-weight: bold;">${vacRem.toFixed(1)} / ${sysSettings.vacationLimit} hrs</span></div>
                <div class="fin-row"><span>Unpaid Absences:</span> <span style="color: var(--night); font-weight: bold;">${ytdUnpaid.toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Drop Days (Off):</span> <span style="color: var(--day); font-weight: bold;">${(ytdDropOff / 12).toFixed(0)} shifts (${ytdDropOff.toFixed(1)} hrs)</span></div>
            </div>

            <div class="pp-financials">
                <div class="fin-section-title" style="margin-top: 0;">Premium Hours</div>
                <div class="fin-row"><span>Aft/Night:</span> <span>${(aftH + nightH).toFixed(1)} hrs</span></div>
                <div class="fin-row"><span>Sat/Sun:</span> <span>${(satH + sunH).toFixed(1)} hrs</span></div>
                <div class="fin-section-title deduct">Deductions</div>
                <div class="fin-row"><span>Tax (Fed+ON):</span> <span>-$${(t.fedTax + t.onTax).toFixed(2)}</span></div>
                <div class="fin-row"><span>CPP / EI:</span> <span>-$${(t.cpp + t.ei).toFixed(2)}</span></div>
                <div class="fin-row" style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed var(--border); font-weight: bold; color: var(--text);"><span>Gross:</span> <span>$${gross.toFixed(2)}</span></div>
                <div class="fin-row net"><span>Net Pay:</span> <span>$${(gross - t.total).toFixed(2)}</span></div>
            </div>
        </div>`;
    openSheet('sheet-payroll');
}

function openSettingsSheet() {
    haptic();
    const yearSelect = document.getElementById('year-select');
    const year = yearSelect ? parseInt(yearSelect.value) : getLogicalToday().getFullYear(); 
    
    const cppS = document.getElementById('cpp-max-pp'); 
    const eiS = document.getElementById('ei-max-pp');
    let opts = `<option value="9999">Not Met Yet</option>`;
    for (let i = 0; i < 300; i++) {
        let ppE = new Date(basePPStartUTC + (i * 14 + 13) * 86400000);
        if (ppE.getUTCFullYear() === year) opts += `<option value="${i}">Ending ${ppE.toLocaleDateString('en-US', {month:'short', day:'numeric'})}</option>`;
    }
    if(cppS) cppS.innerHTML = opts; 
    if(eiS) eiS.innerHTML = opts;
    
    let sTheme = document.getElementById('setting-theme');
    if(sTheme) sTheme.value = sysSettings.theme;

    let dName = document.getElementById('setting-display-name');
    if(dName) dName.value = sysSettings.displayName;
    
    let rRate = document.getElementById('setting-reg-rate');
    if(rRate) rRate.value = sysSettings.regRate.toFixed(2);
    
    let tRate = document.getElementById('setting-tl-rate');
    if(tRate) tRate.value = sysSettings.tlRate.toFixed(2);
    
    let defRole = document.getElementById('setting-default-role');
    if(defRole) defRole.value = sysSettings.defaultRole;
    
    let vacLimit = document.getElementById('setting-vacation-limit');
    if(vacLimit) vacLimit.value = sysSettings.vacationLimit;

    let vacStart = document.getElementById('setting-vac-start');
    if(vacStart) vacStart.value = sysSettings.vacationStartDate;

    let vacEnd = document.getElementById('setting-vac-end');
    if(vacEnd) vacEnd.value = sysSettings.vacationEndDate;
    
    let defCrew = document.getElementById('setting-default-crew');
    if(defCrew) defCrew.value = sysSettings.defaultCrew;
    
    let sYear = document.getElementById('setting-start-year');
    if(sYear) sYear.value = sysSettings.startYear;
    
    let eYear = document.getElementById('setting-end-year');
    if(eYear) eYear.value = sysSettings.endYear;
    
    let rotInput = document.getElementById('rot-date-input');
    if(rotInput) rotInput.value = savedRot.date;

    let n24 = document.getElementById('setting-notif-24');
    if(n24) n24.checked = sysSettings.notif24h;

    let n12 = document.getElementById('setting-notif-12');
    if(n12) n12.checked = sysSettings.notif12h;

    let n3 = document.getElementById('setting-notif-3');
    if(n3) n3.checked = sysSettings.notif3h;

    let sBio = document.getElementById('setting-biometrics');
    if(sBio) sBio.checked = sysSettings.useBiometrics;

    let sCal = document.getElementById('setting-cal-sync');
    if(sCal) sCal.checked = sysSettings.syncCalendar;

    let sAlm = document.getElementById('setting-alarms');
    if(sAlm) sAlm.checked = sysSettings.smartAlarms;
    
    selectedRotOffset = savedRot.offset;
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => { 
        b.classList.remove('active'); 
        if (b.id === 'btn-rot-' + selectedRotOffset) b.classList.add('active'); 
    });
    
    if(cppS) cppS.value = sysSettings.cppMaxPP; 
    if(eiS) eiS.value = sysSettings.eiMaxPP;
    
    openSheet('sheet-settings');
}

function saveSettings() {
    haptic();
    let dName = document.getElementById('setting-display-name');
    let rRate = document.getElementById('setting-reg-rate');
    let tRate = document.getElementById('setting-tl-rate');
    let dRole = document.getElementById('setting-default-role');
    let vLimit = document.getElementById('setting-vacation-limit');
    let vStart = document.getElementById('setting-vac-start');
    let vEnd = document.getElementById('setting-vac-end');
    let cppS = document.getElementById('cpp-max-pp');
    let eiS = document.getElementById('ei-max-pp');
    let dCrew = document.getElementById('setting-default-crew');
    let sYear = document.getElementById('setting-start-year');
    let eYear = document.getElementById('setting-end-year');

    sysSettings = { 
        theme: document.getElementById('setting-theme') ? document.getElementById('setting-theme').value : 'system',
        displayName: dName ? (dName.value || 'Drizzy') : 'Drizzy',
        regRate: rRate ? (parseFloat(rRate.value) || 47.06) : 47.06,
        tlRate: tRate ? (parseFloat(tRate.value) || 50.11) : 50.11,
        defaultRole: dRole ? (dRole.value || 'Reg') : 'Reg',
        vacationLimit: vLimit ? (parseFloat(vLimit.value) || 150) : 150,
        vacationStartDate: vStart && vStart.value ? vStart.value : '2026-01-01',
        vacationEndDate: vEnd && vEnd.value ? vEnd.value : '2027-01-15',
        cppMaxPP: cppS ? parseInt(cppS.value) : 9999, 
        eiMaxPP: eiS ? parseInt(eiS.value) : 9999, 
        defaultCrew: dCrew ? dCrew.value : 'D',
        startYear: sYear ? (parseInt(sYear.value) || 2024) : 2024,
        endYear: eYear ? (parseInt(eYear.value) || 2036) : 2036,
        notif24h: document.getElementById('setting-notif-24') ? document.getElementById('setting-notif-24').checked : true,
        notif12h: document.getElementById('setting-notif-12') ? document.getElementById('setting-notif-12').checked : true,
        notif3h: document.getElementById('setting-notif-3') ? document.getElementById('setting-notif-3').checked : true,
        useBiometrics: document.getElementById('setting-biometrics') ? document.getElementById('setting-biometrics').checked : false,
        syncCalendar: document.getElementById('setting-cal-sync') ? document.getElementById('setting-cal-sync').checked : false,
        smartAlarms: document.getElementById('setting-alarms') ? document.getElementById('setting-alarms').checked : false
    };
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify(sysSettings));
    
    let gText = document.getElementById('greeting-text');
    if(gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;
    
    let rotInput = document.getElementById('rot-date-input');
    if (rotInput && rotInput.value && selectedRotOffset !== null) { 
        savedRot = { date: rotInput.value, offset: selectedRotOffset }; 
        localStorage.setItem('kingDrewRotationV20', JSON.stringify(savedRot)); 
    }
    populateYearSelect(); renderCalendar(); closeAllSheets(); updateNotifications();
    showToast('Settings Saved');
}

function selectRotOffset(o) { 
    haptic();
    selectedRotOffset = o; 
    document.querySelectorAll('#sheet-settings .crew-type').forEach(b => b.classList.remove('active')); 
    let btn = document.getElementById('btn-rot-' + o);
    if(btn) btn.classList.add('active'); 
}

function openSheet(id) { 
    document.body.style.overflow = 'hidden'; 
    let overlay = document.getElementById('overlay');
    let sheet = document.getElementById(id);
    if(overlay) overlay.style.display = 'block'; 
    setTimeout(() => { 
        if(overlay) overlay.style.opacity = '1'; 
        if(sheet) sheet.classList.add('active'); 
    }, 10); 
    history.pushState({ sheetOpen: true }, ""); 
}

function closeAllSheets(fromHistory = false) { 
    const isActive = document.querySelector('.bottom-sheet.active') !== null;
    if (!isActive) return;
    document.body.style.overflow = ''; 
    document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active')); 
    let overlay = document.getElementById('overlay');
    if(overlay) overlay.style.opacity = '0'; 
    setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 300); 
    if (fromHistory !== true) { history.back(); }
}

function updateNotifications() {
    if (!window.cordova || !cordova.plugins || !cordova.plugins.notification || !cordova.plugins.notification.local) {
        handleCalendarSyncAndRender();
        return;
    }
    
    cordova.plugins.notification.local.cancelAll(function() {
        let crew = sysSettings.defaultCrew;
        let notifications = [];
        let now = new Date();
        let nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        
        precalcFatigue(now.getFullYear(), crew);
        if (now.getMonth() === 11) precalcFatigue(now.getFullYear() + 1, crew);
        if (now.getMonth() === 0) precalcFatigue(now.getFullYear() - 1, crew);
        
        for (let i = 0; i < 30; i++) {
            let checkUTC = nowUTC + (i * 86400000);
            let c = new Date(checkUTC);
            let dStr = `${c.getUTCFullYear()}-${String(c.getUTCMonth()+1).padStart(2,'0')}-${String(c.getUTCDate()).padStart(2,'0')}`;
            
            let bS = getShiftForCrew(getPIndex(checkUTC), crew);
            let ex = extraShifts[dStr];
            let f = dayFatigue[dStr] || {};
            
            let sTime = null;
            let isOff = false;
            
            if (ex) {
                if (['Off', 'DropOff', 'Vacation', 'Lieu'].includes(ex.type) && (!ex.startTime || !ex.endTime)) {
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
                if (bS === 'D') sTime = '06:30';
                else if (bS === 'N') sTime = '18:30';
                else if (bS === 'O') isOff = true;
            }

            if (f.isLockout && (!ex || !ex.overrideLockout)) {
                isOff = true;
            }
            
            if (sTime && !isOff) {
                let [hh, mm] = sTime.split(':').map(Number);
                let shiftStart = new Date(parseInt(dStr.substring(0,4)), parseInt(dStr.substring(5,7)) - 1, parseInt(dStr.substring(8,10)), hh, mm, 0);
                
                let shiftName = (hh >= 12) ? 'Night Shift' : 'Day Shift';
                if (ex && ex.type === 'Day') shiftName = 'Day Shift';
                if (ex && ex.type === 'Night') shiftName = 'Night Shift';

                let shortDate = dStr.replace(/-/g, '').substring(2); 

                if (sysSettings.notif24h) {
                    let t24 = new Date(shiftStart.getTime() - (24 * 60 * 60 * 1000));
                    if (t24 > now) {
                        notifications.push({
                            id: parseInt(shortDate + '1'),
                            title: 'Upcoming Shift in 24h',
                            text: `You have a ${shiftName} starting tomorrow at ${formatTime12(sTime)}.`,
                            trigger: { at: t24 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ff6d00'
                        });
                    }
                }

                if (sysSettings.notif12h) {
                    let t12 = new Date(shiftStart.getTime() - (12 * 60 * 60 * 1000));
                    if (t12 > now) {
                        notifications.push({
                            id: parseInt(shortDate + '2'),
                            title: 'Upcoming Shift in 12h',
                            text: `You have a ${shiftName} starting today at ${formatTime12(sTime)}.`,
                            trigger: { at: t12 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ff6d00'
                        });
                    }
                }

                if (sysSettings.notif3h) {
                    let t3 = new Date(shiftStart.getTime() - (3 * 60 * 60 * 1000));
                    if (t3 > now) {
                        notifications.push({
                            id: parseInt(shortDate + '3'),
                            title: 'Shift Starts Soon',
                            text: `Your ${shiftName} starts in 3 hours (${formatTime12(sTime)}).`,
                            trigger: { at: t3 }, foreground: true, vibrate: true, smallIcon: 'res://icon', color: '#ea4335'
                        });
                    }
                }

                if (sysSettings.smartAlarms) {
                    let wakeTime = new Date(shiftStart.getTime() - (2 * 60 * 60 * 1000));
                    if (wakeTime > now) {
                        notifications.push({
                            id: parseInt(shortDate + '4'),
                            title: `⏰ WAKE UP - ${shiftName}`,
                            text: `Your shift starts in 2 hours!`,
                            trigger: { at: wakeTime }, priority: 2, wakeup: true, sound: 'default', vibrate: true, color: '#ff3b30'
                        });
                    }
                }
            }
        }
        
        if (notifications.length > 0) {
            cordova.plugins.notification.local.schedule(notifications);
        }
        
        handleCalendarSyncAndRender(); 
    });
}

document.addEventListener("deviceready", function() {
    document.addEventListener("backbutton", function (e) {
        let activeEl = document.activeElement;
        let isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        if (isInputFocused) {
            activeEl.blur(); 
            return; 
        }

        if (document.querySelector('.bottom-sheet.active')) {
            closeAllSheets();
        } else {
            navigator.app.exitApp();
        }
    }, false);

    if (window.cordova && cordova.plugins && cordova.plugins.notification && cordova.plugins.notification.local) {
        cordova.plugins.notification.local.hasPermission(function (granted) {
            if (!granted) {
                cordova.plugins.notification.local.requestPermission(function (granted) {
                    if (granted) updateNotifications();
                });
            } else {
                updateNotifications();
            }
        });
    }
}, false);

window.addEventListener('popstate', () => {
    let activeEl = document.activeElement;
    let isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (isInputFocused) {
        activeEl.blur(); 
        history.pushState({ sheetOpen: true }, ""); 
        return; 
    }

    if (document.querySelector('.bottom-sheet.active')) { closeAllSheets(true); }
});

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

let gText = document.getElementById('greeting-text');
if(gText) gText.innerText = `Welcome, ${sysSettings.displayName}`;
populateYearSelect();

let cSel = document.getElementById('crew-select');
if(cSel) cSel.value = sysSettings.defaultCrew;
renderCalendar();
