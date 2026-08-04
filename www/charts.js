/* ============================================================================
 *  charts.js — lightweight inline-SVG analytics charts for Shift Hub
 *  No external dependency. Themed entirely from CSS custom properties so the
 *  charts re-colour automatically in dark / light mode. Animations respect
 *  prefers-reduced-motion. All renderers clear their host and redraw, so they
 *  are safe to call on every renderAnalyticsDashboard pass.
 * ========================================================================== */

const _C_NS = 'http://www.w3.org/2000/svg';
const _cReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a colour: '#abc' / 'rgb(...)' passes through, '--token' or 'token'
 *  is read from the document root so the chart follows the active theme. */
function _cCol(c) {
    if (!c) return '#888';
    if (c[0] === '#' || c.startsWith('rgb') || c.startsWith('hsl')) return c;
    const name = c[0] === '-' ? c : '--' + c;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || '#888';
}

function _cEl(tag, attrs) {
    const e = document.createElementNS(_C_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
}

function _cSvg(w, h) {
    const s = _cEl('svg', {
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: 'xMidYMid meet'
    });
    // Set height via CSS (not SVG attribute) so WebKit/Chrome don't recompute it
    // from the viewBox aspect ratio when width is percentage-based.
    s.style.cssText = `display:block;overflow:visible;width:100%;height:${h}px`;
    return s;
}

/** rAF tween; jumps straight to the end state when reduced-motion is on. */
function _cAnimate(fn, dur, delay) {
    if (_cReduce) { fn(1); return; }
    delay = delay || 0;
    setTimeout(() => {
        const t0 = performance.now();
        (function step(now) {
            const p = Math.min(1, (now - t0) / dur);
            fn(1 - Math.pow(1 - p, 3));
            if (p < 1) requestAnimationFrame(step);
        })(performance.now());
    }, delay);
}

function _cText(x, y, txt, size, weight, color, anchor) {
    const t = _cEl('text', {
        x, y, 'text-anchor': anchor || 'middle', fill: _cCol(color),
        'font-size': size, 'font-weight': weight, 'font-family': 'Nunito, sans-serif'
    });
    t.setAttribute('class', 'num');
    if (txt != null) t.textContent = txt;
    return t;
}

/* ── Viz 3 · 120h fatigue gauge (semicircle with zones) ──────────────────── */
function chartGauge(hostId, used, max) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    const pct = Math.max(0, Math.min(1, used / max));
    // cy=112 so the arc endpoints sit at y=112 and the "0/max" labels at y=128 fit inside H=140.
    const W = 220, H = 140, cx = W / 2, cy = 112, R = 88, sw = 16;
    const s = _cEl('svg', {
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'xMidYMid meet'
    });
    // height:auto lets it scale proportionally with its container;
    // max-width is set inline so it doesn't rely on an external CSS rule.
    s.style.cssText = `display:block;overflow:hidden;width:100%;height:auto;max-width:${W}px;margin:0 auto`;
    const a0 = Math.PI, a1 = 0;
    const ang = t => a0 + (a1 - a0) * t;
    const pt = (t, r) => [cx + Math.cos(ang(t)) * r, cy + Math.sin(ang(t)) * r];
    function arc(t0, t1, r, color, width, opacity) {
        const [x0, y0] = pt(t0, r), [x1, y1] = pt(t1, r);
        const large = (t1 - t0) > 0.5 ? 1 : 0;
        return _cEl('path', {
            d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
            fill: 'none', stroke: _cCol(color), 'stroke-width': width,
            'stroke-linecap': 'round', opacity: opacity == null ? 1 : opacity
        });
    }
    // zone track
    s.appendChild(arc(0, 0.75, R, '--good', sw, 0.20));
    s.appendChild(arc(0.75, 0.9, R, '--warn', sw, 0.20));
    s.appendChild(arc(0.9, 1, R, '--bad', sw, 0.20));
    const zoneColor = pct >= 0.9 ? '--bad' : pct >= 0.75 ? '--warn' : '--good';
    const val = arc(0, Math.max(0.001, pct), R, zoneColor, sw, 1);
    s.appendChild(val);
    _cAnimate(t => {
        const cur = pct * t;
        const [x0, y0] = pt(0, R), [x1, y1] = pt(cur, R);
        const large = cur > 0.5 ? 1 : 0;
        val.setAttribute('d', `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`);
    }, 900, 80);
    const big = _cText(cx, cy - 18, null, 30, 900, '--text');
    s.appendChild(big);
    s.appendChild(_cText(cx, cy, 'of ' + max + 'h used', 12, 700, '--text-muted'));
    _cAnimate(t => { big.textContent = (used * t).toFixed(1) + 'h'; }, 900, 80);
    s.appendChild(_cText(cx - R, cy + 18, '0', 10, 700, '--text-muted'));
    s.appendChild(_cText(cx + R, cy + 18, String(max), 10, 700, '--text-muted'));
    host.appendChild(s);
}

/* ── Viz 2 · 100% stacked pay-breakdown bar ──────────────────────────────── */
/* segs: [[label, value, colorToken], ...] */
/* segs: [[label, value, colorToken], ...]; fmtVal: optional fn(value)->string for legend */
function chartStacked(hostId, legendId, segs, fmtVal) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    segs = segs.filter(s => s[1] > 0);
    const total = segs.reduce((a, x) => a + x[1], 0) || 1;
    const W = 440, H = 34, r = 10;
    const s = _cSvg(W, H);
    s.appendChild(_cEl('rect', { x: 0, y: 0, width: W, height: H, rx: r, fill: _cCol('--border') }));
    const clipId = 'pbclip_' + hostId;
    const clip = _cEl('clipPath', { id: clipId });
    clip.appendChild(_cEl('rect', { x: 0, y: 0, width: W, height: H, rx: r }));
    s.appendChild(clip);
    const g = _cEl('g', { 'clip-path': `url(#${clipId})` });
    s.appendChild(g);
    let xpos = 0;
    segs.forEach((seg, i) => {
        const w = W * (seg[1] / total);
        const rect = _cEl('rect', { x: xpos, y: 0, width: 0, height: H, fill: _cCol(seg[2]) });
        g.appendChild(rect);
        const fx = xpos;
        _cAnimate(t => rect.setAttribute('width', Math.max(0, w * t)), 600, i * 70);
        if (w > 42) {
            const pctTxt = _cText(fx + w / 2, H / 2 + 4, Math.round(seg[1] / total * 100) + '%', 11, 900, '#1a1820');
            pctTxt.style.opacity = 0;
            g.appendChild(pctTxt);
            _cAnimate(t => pctTxt.style.opacity = t, 300, 300 + i * 70);
        }
        xpos += w;
    });
    host.appendChild(s);
    const lg = document.getElementById(legendId);
    if (lg) {
        lg.innerHTML = '';
        segs.forEach(seg => {
            const d = document.createElement('div');
            d.className = 'ch-lg';
            const valStr = fmtVal ? fmtVal(seg[1]) : '$' + Math.round(seg[1]).toLocaleString();
            d.innerHTML = `<span class="ch-sw" style="background:${_cCol(seg[2])}"></span>${seg[0]} <b class="num">${valStr}</b>`;
            lg.appendChild(d);
        });
    }
}

/* ── Viz 4 · annual cap rings ────────────────────────────────────────────── */
/* rings: [[label, valueText, pct(0-1), colorToken], ...] */
function chartRings(hostId, rings) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    rings.forEach((rg, idx) => {
        const [label, valTxt, pct, color] = rg;
        const W = 110, H = 110, cx = 55, cy = 55, R = 44, sw = 10;
        // Pad the viewBox by 8px on each side so the stroke has clearance; clip any bleed.
        const pad = 8;
        const s = _cEl('svg', {
            viewBox: `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`,
            preserveAspectRatio: 'xMidYMid meet'
        });
        s.style.cssText = `display:block;overflow:hidden;width:100%;height:${H}px`;
        const Circ = 2 * Math.PI * R;
        s.appendChild(_cEl('circle', { cx, cy, r: R, fill: 'none', stroke: _cCol('--border'), 'stroke-width': sw }));
        const arc = _cEl('circle', {
            cx, cy, r: R, fill: 'none', stroke: _cCol(color), 'stroke-width': sw,
            'stroke-linecap': 'round', transform: `rotate(-90 ${cx} ${cy})`,
            'stroke-dasharray': Circ, 'stroke-dashoffset': Circ
        });
        s.appendChild(arc);
        const p = Math.max(0, Math.min(1, pct));
        _cAnimate(t => arc.setAttribute('stroke-dashoffset', Circ * (1 - p * t)), 900, 60 + idx * 90);
        const pctT = _cText(cx, cy + 5, null, 17, 900, '--text');
        s.appendChild(pctT);
        _cAnimate(t => pctT.textContent = Math.round(p * 100 * t) + '%', 900, 60 + idx * 90);
        const box = document.createElement('div');
        box.className = 'ch-ring-cap';
        box.appendChild(s);
        box.insertAdjacentHTML('beforeend', `<div class="ch-ring-k">${label}</div><div class="ch-ring-v num">${valTxt}</div>`);
        host.appendChild(box);
    });
}

/* ── Viz 5 · composition donut ───────────────────────────────────────────── */
/* segs: [[label, value, colorToken], ...] */
function chartDonut(hostId, legendId, segs, centerTop, centerBot) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    segs = segs.filter(s => s[1] > 0);
    const W = 130, H = 130, cx = 65, cy = 65, R = 50, sw = 18;
    // Pad the viewBox by 10px on each side so the stroke has clearance; clip any bleed.
    const pad = 10;
    const s = _cEl('svg', {
        viewBox: `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`,
        preserveAspectRatio: 'xMidYMid meet'
    });
    s.style.cssText = `display:block;overflow:hidden;width:100%;height:${H}px;max-width:${W}px;margin:0 auto`;
    const total = segs.reduce((a, x) => a + x[1], 0) || 1;
    const Circ = 2 * Math.PI * R;
    s.appendChild(_cEl('circle', { cx, cy, r: R, fill: 'none', stroke: _cCol('--border'), 'stroke-width': sw, opacity: 0.5 }));
    let off = 0;
    segs.forEach((seg, i) => {
        const frac = seg[1] / total;
        const arc = _cEl('circle', {
            cx, cy, r: R, fill: 'none', stroke: _cCol(seg[2]), 'stroke-width': sw,
            transform: `rotate(-90 ${cx} ${cy})`, 'stroke-dasharray': `0 ${Circ}`
        });
        s.appendChild(arc);
        const start = off, seglen = Circ * frac;
        _cAnimate(t => {
            arc.setAttribute('stroke-dasharray', `${seglen * t} ${Circ}`);
            arc.setAttribute('stroke-dashoffset', -Circ * start);
        }, 650, i * 90);
        off += frac;
    });
    s.appendChild(_cText(cx, cy - 1, centerTop, 19, 900, '--text'));
    s.appendChild(_cText(cx, cy + 15, centerBot, 10, 700, '--text-muted'));
    host.appendChild(s);
    const lg = document.getElementById(legendId);
    if (lg) {
        lg.innerHTML = '';
        segs.forEach(seg => {
            const d = document.createElement('div');
            d.className = 'ch-lg';
            d.innerHTML = `<span class="ch-sw" style="background:${_cCol(seg[2])}"></span>${seg[0]} <b class="num">${seg[1]}</b>`;
            lg.appendChild(d);
        });
    }
}

/* ── Viz 6 · month-vs-month paired bars ──────────────────────────────────── */
/* rows: [[label, thisVal, prevVal], ...] */
function chartPaired(hostId, rows, thisLabel, prevLabel) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    const W = 300, rowH = 48, H = rows.length * rowH;
    const s = _cSvg(W, H);
    const labelW = 0, barX = 0, barW = W - 44;
    rows.forEach((r, i) => {
        const max = Math.max(r[1], r[2], 1) * 1.12;
        const yTop = i * rowH + 4;
        s.appendChild(_cText(barX, yTop + 11, r[0], 12, 700, '--text', 'start'));
        [[r[1], '--accent', yTop + 17, 1], [r[2], '--border', yTop + 30, 0.95]].forEach(([v, color, yy, op], j) => {
            const w = barW * (v / max);
            // Faint full-length track so zero-value rows still read as bars
            // instead of stray "0" text floating in space.
            s.appendChild(_cEl('rect', { x: barX, y: yy, width: barW, height: 11, rx: 5.5, fill: _cCol('--m3-surface-container-high'), opacity: 0.55 }));
            const bar = _cEl('rect', { x: barX, y: yy, width: 0, height: 11, rx: 5.5, fill: _cCol(color), opacity: op });
            s.appendChild(bar);
            _cAnimate(t => bar.setAttribute('width', Math.max(0, w * t)), 600, i * 80 + j * 60);
            const vt = _cText(0, yy + 10, (Math.round(v * 10) / 10), 10, 800, '--text-muted', 'start');
            vt.style.opacity = 0;
            s.appendChild(vt);
            _cAnimate(t => { vt.setAttribute('x', barX + Math.max(0, w * t) + 6); vt.style.opacity = t; }, 600, i * 80 + j * 60);
        });
        const dv = Math.round((r[1] - r[2]) * 10) / 10;
        s.appendChild(_cText(W, yTop + 11, (dv > 0 ? '+' : '') + dv, 12, 900, dv > 0 ? '--good' : dv < 0 ? '--bad' : '--text-muted', 'end'));
    });
    host.appendChild(s);
    host.insertAdjacentHTML('beforeend',
        `<div class="ch-legend"><div class="ch-lg"><span class="ch-sw" style="background:${_cCol('--accent')}"></span>${thisLabel}</div><div class="ch-lg"><span class="ch-sw" style="background:${_cCol('--border')}"></span>${prevLabel}</div></div>`);
}

/* ── Horizontal labelled bar chart (pay-period hours breakdown) ──────────── */
/* bars: [[label, value, colorToken], ...]; unit appended to the value label */
function chartBars(hostId, bars, unit) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    unit = unit || '';
    const all = bars.filter(b => b[1] > 0);
    if (!all.length) { host.innerHTML = '<div class="ch-empty">No hours this period</div>'; return; }
    const labelW = 44, valW = 52, padR = 6;
    const rowH = 28, gap = 8, W = 440;
    const H = all.length * (rowH + gap);
    const s = _cSvg(W, H);
    const barX = labelW, barMax = W - labelW - valW - padR;
    const max = Math.max(...all.map(b => b[1])) * 1.05 || 1;
    all.forEach((b, i) => {
        const y = i * (rowH + gap);
        const cy = y + rowH / 2;
        s.appendChild(_cText(0, cy + 4, b[0], 12, 800, '--text-muted', 'start'));
        s.appendChild(_cEl('rect', { x: barX, y: y + 4, width: barMax, height: rowH - 8, rx: 6, fill: _cCol('--border'), opacity: 0.5 }));
        const w = barMax * (b[1] / max);
        const bar = _cEl('rect', { x: barX, y: y + 4, width: 0, height: rowH - 8, rx: 6, fill: _cCol(b[2]) });
        s.appendChild(bar);
        _cAnimate(t => bar.setAttribute('width', Math.max(0, w * t)), 600, i * 70);
        const vt = _cText(W - padR, cy + 4, null, 12, 800, '--text', 'end');
        vt.style.opacity = 0; s.appendChild(vt);
        _cAnimate(t => { vt.textContent = (Math.round(b[1] * 10 * t) / 10) + unit; vt.style.opacity = t; }, 600, i * 70);
    });
    host.appendChild(s);
}

/* ── Viz 1 · pay / hours trend (bar + line, toggle) ──────────────────────── */
let _trendData = null, _trendKey = 'gross';
const _TREND_META = {
    gross: { color: '--c-net', fmt: v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)) },
    hours: { color: '--c-reg', fmt: v => Math.round(v) + 'h' },
    ot:    { color: '--c-ot',  fmt: v => (Math.round(v * 10) / 10) + 'h' }
};

/** series: { labels:[], gross:[], hours:[], ot:[] } */
function chartTrend(series) {
    _trendData = series;
    if (!_TREND_META[_trendKey]) _trendKey = 'gross';
    // Sync the segmented toggle to the persisted selection (HTML is rebuilt each render)
    const seg = document.getElementById('trend-seg');
    if (seg) [...seg.children].forEach(b => b.classList.toggle('active', b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${_trendKey}'`)));
    _drawTrend();
}

function chartTrendSwitch(btn, key) {
    _trendKey = key;
    const seg = btn.parentElement;
    if (seg) [...seg.children].forEach(c => c.classList.toggle('active', c === btn));
    _drawTrend();
}

function _drawTrend() {
    const host = document.getElementById('chart-trend');
    if (!host || !_trendData) return;
    host.innerHTML = '';
    const meta = _TREND_META[_trendKey];
    const vals = _trendData[_trendKey] || [];
    const labels = _trendData.labels || [];
    if (!vals.length) { host.innerHTML = '<div class="ch-empty">Not enough history yet</div>'; return; }
    const W = 440, H = 150, padL = 8, padR = 8, padT = 16, padB = 26;
    const s = _cSvg(W, H);
    const n = vals.length, max = (Math.max(...vals) || 1) * 1.15;
    const bw = (W - padL - padR) / n, gap = bw * 0.32;
    const x = i => padL + i * bw + gap / 2, bwi = bw - gap;
    const y = v => padT + (H - padT - padB) * (1 - v / max);
    const color = _cCol(meta.color);
    s.appendChild(_cEl('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: _cCol('--border'), 'stroke-width': 1 }));
    vals.forEach((v, i) => {
        const bh = (H - padT - padB) * (v / max);
        const last = i === n - 1;
        const rect = _cEl('rect', { x: x(i), y: H - padB, width: bwi, height: 0, rx: 6, fill: last ? color : _cCol('--border'), opacity: last ? 1 : 0.55 });
        s.appendChild(rect);
        _cAnimate(t => { const hh = Math.max(0, bh * t); rect.setAttribute('height', hh); rect.setAttribute('y', H - padB - hh); }, 520, i * 45);
        if (last) {
            const tx = _cText(x(i) + bwi / 2, y(v) - 6, meta.fmt(v), 12, 800, '--text');
            tx.style.opacity = 0; s.appendChild(tx);
            _cAnimate(t => tx.style.opacity = t, 300, n * 45);
        }
    });
    const pts = vals.map((v, i) => [x(i) + bwi / 2, y(v)]);
    if (pts.length > 1) {
        const path = _cEl('polyline', {
            fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round',
            'stroke-linejoin': 'round', points: pts.map(p => p.join(',')).join(' '), opacity: 0.9
        });
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        path.setAttribute('stroke-dasharray', len);
        path.setAttribute('stroke-dashoffset', len);
        s.appendChild(path);
        _cAnimate(t => path.setAttribute('stroke-dashoffset', len * (1 - t)), 700, 120);
    }
    pts.forEach((p, i) => {
        const c = _cEl('circle', { cx: p[0], cy: p[1], r: i === n - 1 ? 4 : 2.6, fill: i === n - 1 ? color : _cCol('--card-solid'), stroke: color, 'stroke-width': 2 });
        c.style.opacity = 0; s.appendChild(c);
        _cAnimate(t => c.style.opacity = t, 200, 300 + i * 30);
    });
    labels.forEach((lb, i) => {
        if (!lb) return;
        s.appendChild(_cText(x(i) + bwi / 2, H - 8, lb, 9, 700, '--text-muted'));
    });
    host.appendChild(s);
}

/* ── M3E wavy progress ───────────────────────────────────────────────────── */
/* Filled portion is an undulating sine stroke (scrolling gently unless the
 * user prefers reduced motion), remainder a flat thin track with an M3-style
 * stop dot at the end. Returns an inline SVG string. */
function wavyProgressHTML(pct, color = 'var(--md-primary)') {
    const W = 300, H = 16, amp = 2.8, wl = 20, mid = H / 2;
    const fillW = Math.max(0, Math.min(100, pct)) / 100 * W;
    let d = `M${-wl} ${mid}`;
    for (let x = -wl; x <= W + wl; x += 2) {
        d += ` L${x} ${(mid + Math.sin((x / wl) * 2 * Math.PI) * amp).toFixed(2)}`;
    }
    const id = 'wp' + Math.random().toString(36).slice(2, 8);
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = reduced ? '' :
        `<animateTransform attributeName="transform" type="translate" from="0 0" to="${wl} 0" dur="2.4s" repeatCount="indefinite"/>`;
    const wave = fillW > 1
        ? `<defs><clipPath id="${id}"><rect x="0" y="0" width="${fillW.toFixed(1)}" height="${H}"/></clipPath></defs>` +
          `<g clip-path="url(#${id})"><path d="${d}" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round">${anim}</path></g>`
        : '';
    return `<svg class="wavy-progress" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
        `<line x1="${Math.min(W - 6, fillW + 5).toFixed(1)}" y1="${mid}" x2="${W - 6}" y2="${mid}" stroke="var(--md-surface-container-highest)" stroke-width="3" stroke-linecap="round"/>` +
        wave +
        `<circle cx="${W - 3}" cy="${mid}" r="2.2" fill="${color}"/>` +
        `</svg>`;
}
