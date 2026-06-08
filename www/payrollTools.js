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
function computePPGross(pi, crew, targetYear) {
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
            else if (ex.type === 'Off' || ex.type === 'Lieu') { act = (ex.startTime && ex.endTime) ? getDuration(ex.startTime, ex.endTime) : 0; }
            else if (ex.startTime && ex.endTime)              { act = getDuration(ex.startTime, ex.endTime); }
            else if (ex.type)                                 { act = 12; }
        }
        const _s2    = ex?.shift2;
        const _s2dur = (_s2 && _s2.startTime && _s2.endTime) ? getDuration(_s2.startTime, _s2.endTime) : 0;
        act += _s2dur;

        if (f.isLockout && !isVac && ex?.type !== 'Off' && ex?.type !== 'DropOff' && ex?.type !== 'Lieu') act = 0;

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
    return gross;
}

/**
 * Compute actual YTD CPP1/CPP2/EI for the year-to-date and project the pay
 * period each contribution reaches its annual maximum (and thus stops).
 * @returns {{cpp1,cpp2,ei: {ytd:number,max:number,pct:number,perPP:number,stopIdx:number|null,done:boolean}, bump:number, avgGross:number}}
 */
function computeYearCaps(crew, currentPP, targetYear) {
    precalcFatigue(targetYear, crew);
    const tbl = getTaxYear(targetYear);

    let firstPP = 0;
    for (let i = currentPP; i >= 0; i--) {
        const testE = basePPStartUTC + (i * 14 + 13) * MS_DAY;
        if (new Date(testE).getUTCFullYear() < targetYear) { firstPP = i + 1; break; }
        if (i === 0) firstPP = 0;
    }

    let ytdCPP1 = 0, ytdCPP2 = 0, ytdEI = 0, ytdGross = 0, ppsDone = 0;
    for (let pi = firstPP; pi <= currentPP; pi++) {
        const g = computePPGross(pi, crew, targetYear);
        const tx = calculateTaxes(g, pi, targetYear);
        ytdCPP1 += tx.cpp; ytdCPP2 += tx.cpp2; ytdEI += tx.ei; ytdGross += g; ppsDone++;
    }

    const avgGross = ppsDone > 0 ? ytdGross / ppsDone : 0;
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
