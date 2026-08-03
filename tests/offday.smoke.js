// Smoke test for the neutral "Off Day" schedule override (type 'OffDay').
// It turns a scheduled Day/Night into a plain off day: green, $0, frees the
// 120h projection, and is NOT counted as an unpaid absence or a drop.
// Run with: npm run test:offday

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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true, defaultCrew: 'B' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  // Find a scheduled working day (Day or Night) for crew B in the next 28 days.
  const info = await page.evaluate(() => {
    const crew = 'B';
    const lt = getLogicalToday();
    const base = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    for (let i = 0; i < 28; i++) {
      const u = base + i * 86400000;
      const s = getShiftForCrew(getPIndex(u), crew);
      if (s === 'D' || s === 'N') {
        const pp = Math.floor((u - basePPStartUTC) / MS_PP);
        const year = new Date(basePPStartUTC + pp * MS_PP + MS_PP_TO_END).getUTCFullYear();
        return { ds: toDateKey(u), shift: s, pp, year };
      }
    }
    return null;
  });
  check('Found a scheduled working day for the test', !!info, JSON.stringify(info));

  // Baseline: this PP's gross with the shift scheduled.
  const before = await page.evaluate((pp, year) => { precalcFatigue(year, 'B'); return computePPGross(pp, 'B', year); }, info.pp, info.year);

  // Turn that day into an Off Day.
  await page.evaluate((ds) => { extraShifts[ds] = { type: 'OffDay' }; localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts)); invalidateFatigueCache(); }, info.ds);
  const after = await page.evaluate((pp, year) => { precalcFatigue(year, 'B'); return computePPGross(pp, 'B', year); }, info.pp, info.year);
  check('Off Day removes the shift pay (gross drops)', after < before - 100, `before=$${before.toFixed(0)} after=$${after.toFixed(0)}`);

  // Frees the 120h projection: the day now contributes 0 base hours.
  const fat = await page.evaluate((ds) => { const f = dayFatigue[ds] || {}; return { baseH: f.baseWorkHours, sched: f.scheduledWorkHours }; }, info.ds);
  check('Off Day contributes 0 hours (frees 120h projection)', fat.baseH === 0 && fat.sched === 0, JSON.stringify(fat));

  // Renders as a plain off day (neutral pill), not an absence.
  const pill = await page.evaluate((ds, shift) => {
    precalcFatigue(+ds.substring(0, 4), 'B');
    const p = buildCellPills(ds, shift, extraShifts[ds], dayFatigue[ds] || {}, 0, getHolidays(+ds.substring(0, 4)));
    return p[0];
  }, info.ds, info.shift);
  check('Off Day shows the neutral Off pill (not "Absent")', pill.cls === 'pill-offday' && /Off/.test(pill.text) && !/Absent/.test(pill.text), JSON.stringify(pill));

  // Save flow: selecting Off Day in the form stores a clean {type:'OffDay'}.
  await page.evaluate((ds) => { delete extraShifts[ds]; localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts)); invalidateFatigueCache(); }, info.ds);
  await page.evaluate((ds, shift) => { openPickupSheet(ds, 'Test day', shift, 'O'); selectType('OffDay'); saveShift(); }, info.ds, info.shift);
  await wait(150);
  const saved = await page.evaluate((ds) => extraShifts[ds] || null, info.ds);
  check('Saving Off Day stores type "OffDay"', saved && saved.type === 'OffDay', JSON.stringify(saved));
  check('Off Day payload carries no vacation/OT hours', saved && saved.vacHours === undefined && saved.otHours === undefined && saved.startTime === undefined, JSON.stringify(saved));

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
