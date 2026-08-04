// Smoke test for the analytics dashboard after its extraction to analytics.js
// plus the three new cards (year-over-year, OT by month, rest & recovery):
//   • dashboard renders with all existing + new cards, zero console errors
//   • seeded OT shifts appear in the OT-by-month bars
//   • YoY card renders both series legends
// Run with: npm run test:analytics

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'www');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (p === '/cordova.js' && !fs.existsSync(file)) { res.writeHead(200, {'Content-Type':'application/javascript'}); return res.end('// stub'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.setRequestInterception(true);
  page.on('request', q => q.url().includes('raw.githubusercontent.com') ? q.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"years":{}}' }) : q.continue());
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await page.goto(base, { waitUntil: 'networkidle0' });
  // Seed an OT pickup in the current month before first render.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true, defaultCrew: 'D' }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);

  const seeded = await page.evaluate(() => {
    const crew = 'D';
    const lt = getLogicalToday();
    const y = lt.getFullYear();
    // Find an off day earlier this year to log OT on.
    for (let u = Date.UTC(y, 0, 2); u < Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate()); u += 86400000) {
      if (getShiftForCrew(getPIndex(u), crew) === 'O') {
        const ds = toDateKey(u);
        extraShifts[ds] = { type: 'Day', startTime: '06:30', endTime: '18:30', otHours: 0, dtHours: 12 };
        localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
        invalidateFatigueCache();
        _anKey = '';                 // force a dashboard re-render
        renderCalendar();
        return { ds, month: +ds.substring(5, 7) };
      }
    }
    return null;
  });
  check('Seeded a 12h OT pickup earlier this year', !!seeded, JSON.stringify(seeded));
  await wait(700);

  // ── Existing dashboard cards still render after the extraction ──────────────
  const cards = await page.evaluate(() => ({
    top:     !!document.querySelector('#pp-top-summary .an-flat-card'),
    rings:   !!document.querySelector('#chart-rings svg'),
    trend:   !!document.querySelector('#chart-trend svg'),
    paybar:  !!document.querySelector('#chart-paybar svg'),
    timeoff: !!document.querySelector('#chart-timeoff svg'),
    paired:  !!document.querySelector('#chart-paired svg')
  }));
  check('Existing cards render after extraction (top summary)', cards.top);
  check('Existing charts render (rings/trend/paybar/timeoff/paired)',
        cards.rings && cards.trend && cards.paybar && cards.timeoff && cards.paired, JSON.stringify(cards));

  // ── New cards ───────────────────────────────────────────────────────────────
  const yoy = await page.evaluate(() => {
    const el = document.getElementById('chart-yoy');
    return el && el.querySelector('svg') ? el.parentElement.textContent : null;
  });
  check('Year-over-year card renders with both year legends', !!yoy && /vs/.test(yoy), (yoy || '').substring(0, 60));

  const otMonth = await page.evaluate((m) => {
    const el = document.getElementById('chart-otmonth');
    if (!el || !el.querySelector('svg')) return null;
    return el.querySelector('svg').textContent;
  }, seeded.month);
  const monthAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][seeded.month - 1];
  check('OT-by-month chart renders', !!otMonth, otMonth ? otMonth.substring(0, 80) : 'missing');
  check(`Seeded OT month (${monthAbbr}) appears in the bars`, !!otMonth && otMonth.includes(monthAbbr));

  const rest = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.an-flat-card-title')];
    const rr = cards.find(c => /Rest/.test(c.textContent));
    return rr ? rr.parentElement.textContent : null;
  });
  check('Rest & Recovery card renders with turnaround stats', !!rest && /Avg Turnaround/.test(rest) && /Short Rests/.test(rest),
        (rest || '').replace(/\s+/g, ' ').substring(0, 90));

  check('Zero console/page errors during dashboard render', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
