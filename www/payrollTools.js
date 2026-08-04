// ─── Payroll tools: YTD cap tracker + paystub verifier ───────────────────────
// Builds on the existing calculateTaxes()/getTaxYear() engine. Two features:
//   • YTD cap tracker  — CPP1 / CPP2 / EI progress to annual max, the projected
//     pay period each one stops, and the resulting per-cheque bump.
//   • Paystub verifier — diff the user's real paystub against the app's own calc
//     for the current pay period, flagging discrepancies line by line.

/**
 * Gross pay for a single pay-period index. Mirrors the canonical per-PP loop in
 * calendar.js (renderAnalyticsDashboard) so projections match the dashboard.
 * Requires precalcFatigue(targetYear, crew) to have run for the relevant year.
 * @returns {number}
 */
// Memo for the per-PP gross loop. The key includes _fatigueVersion (bumped on
// any schedule change), the pay rates and the rotation anchor — i.e. everything
// that can change the result — so a cached value is never stale.
let _ppGrossMemo = {}, _ppGrossMemoVer = -1;
function computePPGross(pi, crew, targetYear) {
    // Drop the whole memo when the schedule changes so it can't grow unbounded.
    if (_ppGrossMemoVer !== _fatigueVersion) { _ppGrossMemo = {}; _ppGrossMemoVer = _fatigueVersion; }
    const memoKey = `${pi}|${crew}|${targetYear}|${sysSettings.regRate}|${sysSettings.tlRate}|${savedRot.date}|${savedRot.offset}`;
    const cached = _ppGrossMemo[memoKey];
    if (cached !== undefined) return cached;

    const s = basePPStartUTC + pi * MS_PP;
    const holCache = {};
    const getHols = y => { if (!holCache[y]) holCache[y] = getHolidays(y); return holCache[y]; };
    let gross = 0;

    for (let d = 0; d <= 13; d++) {
        const u  = s + d * MS_DAY;
        const dS = toDateKey(u);
        const bS = getShiftForCrew(getPIndex(u), crew);
        const ex = extraShifts[dS];
        const f  = dayFatigue[dS] || {};
        const bH = f.baseWorkHours !== undefined ? f.baseWorkHours : ((bS === 'D' || bS === 'N') ? 12 : 0);
        const st = ex?.startTime || ((bS === 'D' || ex?.type === 'Day') ? '06:30' : '18:30');

        let act = bH, isVac = false;
        if (ex) {
            if      (ex.type === 'DropOff')                   { act = 0; }
            else if (ex.type === 'DropPaid')                  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 12; }
            else if (ex.type === 'Vacation')                  { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; isVac = true; }
            else if (ex.type === 'Off' || ex.type === 'Lieu' || ex.type === 'OffDay') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
            else if (ex.startTime && ex.endTime)              { act = getDuration(ex.startTime, ex.endTime); }
            else if (ex.type)                                 { act = 12; }
        }
        const _s2    = ex?.shift2;
        const _s2dur = (_s2 && _s2.startTime && _s2.endTime) ? getDuration(_s2.startTime, _s2.endTime) : 0;
        act += _s2dur;

        if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu' && ex?.type !== 'OffDay') act = 0;

        const dayR = Math.min(act, bH);
        const dayE = Math.max(0, act - bH);

        let rate = sysSettings.regRate;
        if (ex?.role === 'TL')                            rate = sysSettings.tlRate;
        else if (ex?.role === 'Manual' && ex?.manualRate) rate = ex.manualRate;

        if (isVac) {
            const vH = ex.vacHours !== undefined ? ex.vacHours : (ex.startTime && ex.endTime ? Math.max(0, bH - act) : (bH || 12));
            gross += vH * rate;
        }
        if (!f.isLockout && act > 0) {
            const pD = calcPremiums(dS, st, dayR, rate);
            gross += (dayR * rate) + pD.total;
            if (dayE > 0) {
                let sO = (ex?.otHours || 0) + (_s2?.otHours || 0);
                let sD = (ex?.dtHours || 0) + (_s2?.dtHours || 0);
                if (sO === 0 && sD === 0) { if (ex?.type === 'DropPaid') sO = dayE; else sD = dayE; }
                gross += (sO * rate * 1.5) + (sD * rate * 2.0);
                if (_s2dur > 0 && _s2.startTime) gross += calcPremiums(dS, _s2.startTime, _s2dur, rate).total;
            }
        }
        const holInfo = getHols(parseInt(dS.substring(0, 4)))[dS];
        if (holInfo) {
            gross += 8 * rate;
            if (dayR > 0) gross += dayR * rate * (holInfo.m === 2.0 ? 1.0 : 0.5);
        }
        const nextDStr    = toDateKey(u + MS_DAY);
        const nextHolInfo = getHols(parseInt(nextDStr.substring(0, 4)))[nextDStr];
        if (nextHolInfo && dayR > 0 && (bS === 'N' || ex?.type === 'Night')) {
            gross += Math.min(dayR, 10) * rate * (nextHolInfo.m === 2.0 ? 1.0 : 0.5);
        }
    }
    _ppGrossMemo[memoKey] = gross;
    return gross;
}

/**
 * Year-to-date modelled totals from the schedule: gross, tax (fed+ON), and each
 * contribution, accumulated PP-by-PP from the first PP of the year to currentPP.
 * @returns {{gross,fedon,cpp1,cpp2,ei,ppsDone,firstPP}}
 */
function computeYTDModel(crew, currentPP, targetYear) {
    precalcFatigue(targetYear, crew);
    let firstPP = 0;
    for (let i = currentPP; i >= 0; i--) {
        const testE = basePPStartUTC + (i * 14 + 13) * MS_DAY;
        if (new Date(testE).getUTCFullYear() < targetYear) { firstPP = i + 1; break; }
        if (i === 0) firstPP = 0;
    }
    let gross = 0, fedon = 0, cpp1 = 0, cpp2 = 0, ei = 0, ppsDone = 0;
    for (let pi = firstPP; pi <= currentPP; pi++) {
        const g  = computePPGross(pi, crew, targetYear);
        const tx = calculateTaxes(g, pi, targetYear);
        gross += g; fedon += tx.fedTax + tx.onTax; cpp1 += tx.cpp; cpp2 += tx.cpp2; ei += tx.ei; ppsDone++;
    }
    return { gross, fedon, cpp1, cpp2, ei, ppsDone, firstPP };
}

function computeYearCaps(crew, currentPP, targetYear) {
    const tbl = getTaxYear(targetYear);
    const ytd = computeYTDModel(crew, currentPP, targetYear);
    // Bonus / VCP contributions count toward the same annual CPP/EI maximums.
    const xtra = extraPaymentsYTD(targetYear);
    const ytdCPP1 = ytd.cpp1 + xtra.cpp, ytdCPP2 = ytd.cpp2, ytdEI = ytd.ei + xtra.ei, ppsDone = ytd.ppsDone;

    const avgGross = ppsDone > 0 ? ytd.gross / ppsDone : 0;
    const per = calculateTaxes(avgGross, currentPP + 1, targetYear); // representative future PP

    /** Build a per-deduction summary + project the stop pay period. */
    const mk = (ytd, max, perPP) => {
        const pct  = max > 0 ? Math.min(100, Math.round((ytd / max) * 100)) : 0;
        const done = ytd >= max - 0.01;
        let stopIdx = null;
        if (!done && perPP > 0.01) {
            const ppsLeft = Math.ceil((max - ytd) / perPP);
            stopIdx = currentPP + ppsLeft;
        }
        return { ytd, max, pct, perPP, stopIdx, done };
    };

    return {
        cpp1: mk(ytdCPP1, tbl.annCPPMax,  per.cpp),
        cpp2: mk(ytdCPP2, tbl.annCPP2Max, per.cpp2),
        ei:   mk(ytdEI,   tbl.annEIMax,   per.ei),
        bump: per.cpp + per.cpp2 + per.ei,
        avgGross
    };
}

/** Format the pay-period end date for a PP index as a short label. */
function ppEndLabel(idx) {
    const e = new Date(basePPStartUTC + idx * MS_PP + MS_PP_TO_END);
    return e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Render the YTD cap tracker into #captrack-content for the current PP/crew. */
function renderCapTracker() {
    const host = document.getElementById('captrack-content');
    if (!host) return;
    const crew = (document.getElementById('crew-select') || {}).value || sysSettings.defaultCrew;
    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const currentPP = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const targetYear = new Date(basePPStartUTC + currentPP * MS_PP + MS_PP_TO_END).getUTCFullYear();

    const caps = computeYearCaps(crew, currentPP, targetYear);

    const row = (label, c, color) => {
        const statusTxt = c.done
            ? `<span style="color:var(--off);font-weight:800">Maxed out — no longer deducted</span>`
            : (c.stopIdx !== null
                ? `Stops ~PP ending <b>${ppEndLabel(c.stopIdx)}</b> &nbsp;→&nbsp; <span style="color:var(--off);font-weight:800">+$${c.perPP.toFixed(2)}/cheque</span>`
                : `On track`);
        return `
          <div class="cap-row">
            <div class="cap-row-head">
              <span class="cap-name">${label}</span>
              <span class="cap-val num">$${c.ytd.toFixed(0)} / $${c.max.toFixed(0)}</span>
            </div>
            <div class="cap-bar"><div class="cap-bar-fill" style="width:${c.pct}%;background:${color}"></div></div>
            <div class="cap-status">${statusTxt}</div>
          </div>`;
    };

    const anyDone = caps.cpp1.done || caps.cpp2.done || caps.ei.done;
    const footer = anyDone
        ? `<div class="cap-foot">Once all three max out, your net cheque rises by about <b style="color:var(--off)">$${caps.bump.toFixed(2)}</b> per pay.</div>`
        : `<div class="cap-foot">When all three max out (later this year), your net cheque rises by about <b style="color:var(--off)">$${caps.bump.toFixed(2)}</b> per pay.</div>`;

    host.innerHTML =
        row('CPP', caps.cpp1, 'var(--day)') +
        (caps.cpp2.max > 0 ? row('CPP2', caps.cpp2, '#a78bfa') : '') +
        row('EI', caps.ei, 'var(--accent)') +
        footer;
}

function openCapTracker() {
    renderCapTracker();
    openSheet('sheet-captrack');
}

// ── Paystub verifier ─────────────────────────────────────────────────────────

/** Open the verifier prefilled with the app's calc for the active pay period. */
function openVerifySheet() {
    if (!simBaseGross && simBaseGross !== 0) { showToast('Open the pay dashboard first', 'error'); return; }
    // Clear any previously entered actuals + results.
    ['vf-gross', 'vf-tax', 'vf-cpp', 'vf-ei', 'vf-net'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const res = document.getElementById('vf-results');
    if (res) res.innerHTML = '<div class="vf-hint">Enter the numbers from your real paystub, then tap Compare.</div>';
    const lbl = document.getElementById('vf-pp-label');
    if (lbl) lbl.textContent = `Pay period ending ${ppEndLabel(simTargetPP)}`;
    openSheet('sheet-verify');
}

/** Compare entered actuals to the app's computed values and render the diff. */
function runPaystubCompare() {
    haptic();
    const g = simBaseGross;
    const t = calculateTaxes(g, simTargetPP, simTargetYear);
    const app = {
        gross: g,
        tax:   t.fedTax + t.onTax,
        cpp:   t.cpp + t.cpp2,
        ei:    t.ei,
        net:   g - t.total
    };
    const num = id => { const v = parseFloat((document.getElementById(id) || {}).value); return isNaN(v) ? null : v; };
    const actual = { gross: num('vf-gross'), tax: num('vf-tax'), cpp: num('vf-cpp'), ei: num('vf-ei'), net: num('vf-net') };

    const lines = [
        ['Gross', 'gross'],
        ['Tax (Fed+ON)', 'tax'],
        ['CPP (1+2)', 'cpp'],
        ['EI', 'ei'],
        ['Net pay', 'net']
    ];
    let rows = '', anyEntered = false, flagged = 0;
    for (const [label, key] of lines) {
        const a = app[key], u = actual[key];
        if (u === null) {
            rows += `<div class="vf-row"><span>${label}</span><span class="num">$${a.toFixed(2)}</span><span class="vf-actual">—</span><span class="vf-delta">—</span></div>`;
            continue;
        }
        anyEntered = true;
        const delta = u - a;
        const absd  = Math.abs(delta);
        // $1 tolerance = match (rounding); up to $5 = minor; beyond = flag.
        const cls = absd <= 1 ? 'ok' : absd <= 5 ? 'warn' : 'bad';
        if (cls === 'bad') flagged++;
        const sign = delta > 0 ? '+' : '';
        rows += `<div class="vf-row ${cls}"><span>${label}</span><span class="num">$${a.toFixed(2)}</span>` +
                `<span class="vf-actual num">$${u.toFixed(2)}</span>` +
                `<span class="vf-delta num">${sign}$${delta.toFixed(2)}</span></div>`;
    }

    const header = `<div class="vf-row vf-head"><span></span><span>App</span><span>Yours</span><span>Δ</span></div>`;
    let verdict;
    if (!anyEntered) verdict = `<div class="vf-hint">Enter at least one value to compare.</div>`;
    else if (flagged === 0) verdict = `<div class="vf-verdict ok">✓ Everything lines up within rounding.</div>`;
    else verdict = `<div class="vf-verdict bad">⚠ ${flagged} line${flagged > 1 ? 's' : ''} differ by more than $5 — worth a closer look.</div>`;

    const res = document.getElementById('vf-results');
    if (res) res.innerHTML = header + rows + verdict;
}

// ─── Shared: current pay-period context ──────────────────────────────────────
function currentPPInfo() {
    const crew = (document.getElementById('crew-select') || {}).value || sysSettings.defaultCrew;
    const logicalT = getLogicalToday();
    const nowUTC   = Date.UTC(logicalT.getFullYear(), logicalT.getMonth(), logicalT.getDate());
    const currentPP  = Math.floor((nowUTC - basePPStartUTC) / MS_PP);
    const targetYear = new Date(basePPStartUTC + currentPP * MS_PP + MS_PP_TO_END).getUTCFullYear();
    return { crew, currentPP, targetYear };
}

// ─── Pay tools hub ───────────────────────────────────────────────────────────
function openPayTools() { haptic(); openSheet('sheet-paytools'); }

// ─── Paystub history & reconciliation ────────────────────────────────────────
// Stored as { [ppIdx]: { gross, tax, cpp, ei, net, year, savedAt } } — the user's
// real paystub numbers, keyed by pay-period index.
function loadPaystubs() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYSTUBS)) || {}; } catch (e) { return {}; } }
function savePaystubs(obj) { try { localStorage.setItem(STORAGE_KEYS.PAYSTUBS, JSON.stringify(obj)); if (typeof dataChanged === 'function') dataChanged(); } catch (e) {} }

/** Persist the actuals currently entered in the verifier for the active PP. */
function savePaystubEntry() {
    const num = id => { const v = parseFloat((document.getElementById(id) || {}).value); return isNaN(v) ? null : v; };
    const entry = { gross: num('vf-gross'), tax: num('vf-tax'), cpp: num('vf-cpp'), ei: num('vf-ei'), net: num('vf-net') };
    if (entry.gross === null && entry.net === null) { showToast('Enter your paystub first', 'error'); return; }
    entry.year = simTargetYear;
    entry.savedAt = Date.now();
    const all = loadPaystubs();
    all[simTargetPP] = entry;
    savePaystubs(all);
    haptic();
    showToast('Paystub saved to history');
}

/** Sum saved actuals for a year. @returns {{gross,tax,cpp,ei,net,count}} */
function ytdFromActuals(year) {
    const all = loadPaystubs();
    const acc = { gross: 0, tax: 0, cpp: 0, ei: 0, net: 0, count: 0 };
    for (const k of Object.keys(all)) {
        const e = all[k];
        if (e.year !== year) continue;
        acc.gross += e.gross || 0; acc.tax += e.tax || 0; acc.cpp += e.cpp || 0;
        acc.ei += e.ei || 0; acc.net += e.net || 0; acc.count++;
    }
    return acc;
}

function renderPaystubHistory() {
    const host = document.getElementById('history-content');
    if (!host) return;
    const { crew } = currentPPInfo();
    const all = loadPaystubs();
    const keys = Object.keys(all).map(Number).sort((a, b) => b - a);
    if (!keys.length) {
        host.innerHTML = `<div class="vf-hint">No saved paystubs yet. Open a pay period → 🔍 Verify → 💾 Save to keep a record here.</div>`;
        return;
    }

    let drift = { tax: 0, cpp: 0, ei: 0 }, driftN = 0;
    let rows = '';
    for (const pp of keys) {
        const e = all[pp];
        const g = computePPGross(pp, crew, e.year);
        const t = calculateTaxes(g, pp, e.year);
        const appTax = t.fedTax + t.onTax, appCpp = t.cpp + t.cpp2, appEi = t.ei;
        if (e.tax != null) { drift.tax += e.tax - appTax; driftN++; }
        if (e.cpp != null)   drift.cpp += e.cpp - appCpp;
        if (e.ei != null)    drift.ei  += e.ei  - appEi;
        const net = e.net != null ? e.net : (e.gross || 0);
        rows += `<div class="hist-row"><span class="hist-pp">${ppEndLabel(pp)}</span>` +
                `<span class="num">$${(e.gross || 0).toFixed(0)}</span>` +
                `<span class="num" style="color:var(--off);font-weight:800">$${net.toFixed(0)}</span></div>`;
    }

    const ytd = ytdFromActuals(keys.length ? all[keys[0]].year : new Date().getFullYear());
    const driftLine = driftN
        ? `<div class="cap-foot">Average drift vs app over ${driftN} cheque${driftN > 1 ? 's' : ''}: ` +
          `Tax <b style="color:${Math.abs(drift.tax / driftN) > 2 ? 'var(--night)' : 'var(--off)'}">${(drift.tax / driftN >= 0 ? '+' : '')}$${(drift.tax / driftN).toFixed(2)}</b>, ` +
          `CPP <b>${(drift.cpp / driftN >= 0 ? '+' : '')}$${(drift.cpp / driftN).toFixed(2)}</b>, ` +
          `EI <b>${(drift.ei / driftN >= 0 ? '+' : '')}$${(drift.ei / driftN).toFixed(2)}</b>.</div>`
        : '';

    host.innerHTML =
        `<div class="hist-row hist-head"><span>Pay period</span><span>Gross</span><span>Net</span></div>` +
        rows +
        `<div class="cap-foot" style="margin-top:14px">YTD from your saved stubs (${ytd.count}): ` +
        `gross <b>$${ytd.gross.toFixed(0)}</b>, net <b style="color:var(--off)">$${ytd.net.toFixed(0)}</b>.</div>` +
        driftLine;
}
function openPaystubHistory() { renderPaystubHistory(); openSheet('sheet-history'); }

// ─── Holiday-pay explainer ───────────────────────────────────────────────────
function renderHolidayExplainer() {
    const host = document.getElementById('holiday-content');
    if (!host) return;
    const { crew, targetYear } = currentPPInfo();
    precalcFatigue(targetYear, crew);
    const rate = sysSettings.defaultRole === 'TL' ? sysSettings.tlRate : sysSettings.regRate;
    const hols = getHolidays(targetYear);

    let rows = '', total = 0;
    Object.keys(hols).sort().forEach(dS => {
        const h = hols[dS];
        const u  = Date.UTC(+dS.substring(0, 4), +dS.substring(5, 7) - 1, +dS.substring(8, 10));
        const bS = getShiftForCrew(getPIndex(u), crew);
        const ex = extraShifts[dS];
        let worked = (bS === 'D' || bS === 'N') ? 12 : 0;
        if (ex) {
            if (['Off', 'Vacation', 'Lieu', 'DropOff'].includes(ex.type)) worked = 0;
            else if (ex.startTime && ex.endTime) worked = Math.min(12, getDuration(ex.startTime, ex.endTime));
        }
        const base8   = 8 * rate;
        const premMul = h.m === 2.0 ? 1.0 : 0.5;
        const premium = worked > 0 ? worked * rate * premMul : 0;
        const dayTotal = base8 + premium;
        total += dayTotal;
        const when = new Date(u).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        rows += `<div class="hol-row">
            <div class="hol-main"><span class="hol-name">${h.n}</span><span class="hol-when">${when} · ${h.m}×</span></div>
            <div class="hol-calc">8h&nbsp;pay $${base8.toFixed(0)}${worked > 0 ? ` + ${worked}h&nbsp;@&nbsp;${premMul === 1 ? '+100%' : '+50%'} $${premium.toFixed(0)}` : ' · off, no premium'}</div>
            <div class="hol-total num">$${dayTotal.toFixed(2)}</div>
        </div>`;
    });
    host.innerHTML = rows +
        `<div class="cap-foot">Estimated holiday pay for ${targetYear} (Crew ${crew}, ${sysSettings.defaultRole === 'TL' ? 'TL' : 'Reg'} rate): ` +
        `<b style="color:var(--off)">$${total.toFixed(2)}</b>. Night shifts before a holiday earn extra premium not shown here.</div>`;
}
function openHolidayExplainer() { renderHolidayExplainer(); openSheet('sheet-holidays'); }

// ─── T4 / refund estimator ───────────────────────────────────────────────────
function renderT4Estimate() {
    const host = document.getElementById('t4-content');
    if (!host) return;
    const { crew, currentPP, targetYear } = currentPPInfo();
    const ppCount = getPayPeriodsInYear(targetYear);
    const tbl = getTaxYear(targetYear);

    // Prefer the user's real paystubs; fall back to the schedule model.
    const actual = ytdFromActuals(targetYear);
    let gross, taxWithheld, cpp, ei, ppsDone, source;
    if (actual.count > 0) {
        gross = actual.gross; taxWithheld = actual.tax; cpp = actual.cpp; ei = actual.ei;
        ppsDone = actual.count; source = `your ${actual.count} saved paystub${actual.count > 1 ? 's' : ''}`;
    } else {
        const m = computeYTDModel(crew, currentPP, targetYear);
        gross = m.gross; taxWithheld = m.fedon; cpp = m.cpp1 + m.cpp2; ei = m.ei;
        ppsDone = m.ppsDone; source = 'your scheduled hours so far';
    }
    if (ppsDone <= 0) { host.innerHTML = `<div class="vf-hint">No pay periods yet this year to estimate from.</div>`; return; }

    const factor = ppCount / ppsDone;                 // project regular pay → full year
    // Bonus / VCP payments are discrete (not per-pay), so add the year's logged
    // total on top of the projected regular pay rather than scaling it.
    const xtra = extraPaymentsYTD(targetYear);
    const annGross = gross * factor + xtra.gross;
    const annWithheld = taxWithheld * factor + xtra.tax;
    const annCPP = Math.min(cpp * factor + xtra.cpp, tbl.annCPPMax + tbl.annCPP2Max);
    const annEI  = Math.min(ei  * factor + xtra.ei,  tbl.annEIMax);

    // Annual income tax actually owed on the projected gross.
    const owedPP = calculateTaxes(annGross / ppCount, 0, targetYear);
    const annOwed = (owedPP.fedTax + owedPP.onTax) * ppCount;
    const refund = annWithheld - annOwed;

    const box = (label, val) => `<div class="t4-box"><span class="t4-k">${label}</span><span class="t4-v num">$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>`;
    const refundColor = refund >= 0 ? 'var(--off)' : 'var(--night)';
    const refundWord  = refund >= 0 ? 'refund' : 'balance owing';
    const xtraNote = xtra.count > 0 ? ` Includes ${xtra.count} logged bonus/VCP payment${xtra.count > 1 ? 's' : ''}.` : '';

    host.innerHTML =
        `<div class="t4-grid">${box('Box 14 · Employment income', annGross)}${box('Box 22 · Income tax deducted', annWithheld)}${box('Box 16 · CPP contributions', annCPP)}${box('Box 18 · EI premiums', annEI)}</div>` +
        `<div class="t4-refund" style="border-color:${refundColor}"><span>Estimated ${refundWord}</span><b style="color:${refundColor}">$${Math.abs(refund).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>` +
        `<div class="cap-foot">Projected from ${source} (×${factor.toFixed(2)} to a full year).${xtraNote} ${actual.count > 0 ? '' : 'Save real paystubs (🔍 Verify → 💾) for a sharper estimate.'} Not tax advice.</div>`;
}
function openT4Estimate() { renderT4Estimate(); openSheet('sheet-t4'); }

// ─── Bonus & VCP payments ────────────────────────────────────────────────────
// One-off / quarterly payments outside the regular pay schedule (annual bonus,
// quarterly VCP). Logged manually with their gross/net/tax/CPP/EI so they feed
// YTD totals, the contribution-cap projection and the T4/refund estimate.
function loadExtraPayments() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.EXTRA_PAY)) || []; } catch (e) { return []; } }
function saveExtraPayments(arr) { try { localStorage.setItem(STORAGE_KEYS.EXTRA_PAY, JSON.stringify(arr)); if (typeof dataChanged === 'function') dataChanged(); } catch (e) {} }

/** Sum logged bonus/VCP payments for a calendar year. */
function extraPaymentsYTD(year) {
    const acc = { gross: 0, net: 0, tax: 0, cpp: 0, ei: 0, count: 0 };
    loadExtraPayments().forEach(p => {
        if (parseInt((p.date || '').substring(0, 4)) !== year) return;
        acc.gross += +p.gross || 0; acc.net += +p.net || 0; acc.tax += +p.tax || 0;
        acc.cpp += +p.cpp || 0; acc.ei += +p.ei || 0; acc.count++;
    });
    return acc;
}

/** Read the add-payment form, validate, store, and refresh the list. */
function addExtraPayment() {
    const num = id => { const v = parseFloat((document.getElementById(id) || {}).value); return isNaN(v) ? 0 : v; };
    const date = (document.getElementById('xp-date') || {}).value;
    const gross = num('xp-gross');
    if (!date)  { showToast('Pick a payment date', 'error'); return; }
    if (!gross) { showToast('Enter at least the gross amount', 'error'); return; }
    const entry = {
        id: Date.now(),
        type: window._xpType || 'Bonus',
        date,
        gross,
        net: num('xp-net'),
        tax: num('xp-tax'),
        cpp: num('xp-cpp'),
        ei:  num('xp-ei')
    };
    const all = loadExtraPayments();
    all.push(entry);
    saveExtraPayments(all);
    haptic();
    showToast(`${entry.type} payment saved`);
    ['xp-gross', 'xp-net', 'xp-tax', 'xp-cpp', 'xp-ei'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderExtraPayments();
}

function deleteExtraPayment(id) {
    haptic();
    saveExtraPayments(loadExtraPayments().filter(p => p.id !== id));
    renderExtraPayments();
}

/** Set the Bonus/VCP type toggle. */
function selectExtraType(t) {
    window._xpType = t;
    haptic();
    ['Bonus', 'VCP'].forEach(x => {
        const b = document.getElementById('xp-type-' + x);
        if (b) b.classList.toggle('active', x === t);
    });
}

function renderExtraPayments() {
    const host = document.getElementById('xp-list');
    if (!host) return;
    const all = loadExtraPayments().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!all.length) { host.innerHTML = `<div class="vf-hint">No bonus or VCP payments logged yet.</div>`; return; }
    const byYear = {};
    all.forEach(p => { const y = (p.date || '').substring(0, 4); (byYear[y] = byYear[y] || []).push(p); });
    host.innerHTML = Object.keys(byYear).sort().reverse().map(y => {
        const tot = byYear[y].reduce((s, p) => s + (+p.gross || 0), 0);
        const rows = byYear[y].map(p => {
            const when = new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `<div class="xp-row">
                <div class="xp-when"><span class="xp-type xp-${p.type}">${p.type}</span>${when}</div>
                <div class="xp-amt num">$${(+p.gross || 0).toFixed(0)}<span class="xp-net">net $${(+p.net || 0).toFixed(0)}</span></div>
                <button class="xp-del" onclick="deleteExtraPayment(${p.id})" aria-label="Delete">✕</button>
            </div>`;
        }).join('');
        return `<div class="xp-year">${y} · <b>$${tot.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b> gross</div>${rows}`;
    }).join('');
}

function openExtraPayments() {
    if (!window._xpType) window._xpType = 'Bonus';
    selectExtraType(window._xpType);
    const d = document.getElementById('xp-date');
    if (d && !d.value) d.value = new Date().toISOString().slice(0, 10);
    renderExtraPayments();
    openSheet('sheet-extra-pay');
}
