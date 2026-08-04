// Smoke test for the live marginal-pay preview in the booking form:
//   • booking an OT pickup on an off day shows a positive gross/net delta
//     matching the computePPGross difference
//   • an Off Day override on a scheduled day shows a negative delta
//   • the preview leaves the schedule state untouched (no phantom writes)
//   • saveShift still stores the same payload as before the refactor
// Run with: npm run test:paypreview

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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true, defaultCrew: 'D' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  // Find an off day and a working day for crew D in the next 28 days.
  const days = await page.evaluate(() => {
    const crew = 'D';
    const lt = getLogicalToday();
    const base = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    let off = null, work = null;
    for (let i = 1; i < 28 && (!off || !work); i++) {
      const u = base + i * 86400000;
      const s = getShiftForCrew(getPIndex(u), crew);
      const pp = Math.floor((u - basePPStartUTC) / MS_PP);
      const year = new Date(basePPStartUTC + pp * MS_PP + MS_PP_TO_END).getUTCFullYear();
      const d = { ds: toDateKey(u), shift: s, pp, year };
      if (s === 'O' && !off) off = d;
      if ((s === 'D' || s === 'N') && !work) work = d;
    }
    return { off, work };
  });
  check('Found off + working days for the test', !!(days.off && days.work), JSON.stringify(days));

  // ── 1. OT pickup on an off day → positive preview matching the engine ──────
  await page.evaluate((ds, shift) => { openPickupSheet(ds, 'Preview test', shift, 'D'); }, days.off.ds, days.off.shift);
  await page.evaluate(() => {
    document.getElementById('input-start-time').value = '06:30';
    document.getElementById('input-end-time').value = '18:30';
    resetSliders(); updatePickupToggles();
  });
  await wait(500);   // debounce is 180ms

  const preview1 = await page.evaluate(() => {
    const el = document.getElementById('pay-preview');
    return { visible: el.style.display !== 'none', text: el.textContent };
  });
  check('Preview visible with a positive gross delta', preview1.visible && /^\+\$/.test(preview1.text), preview1.text);
  check('Preview includes an approximate net figure', /net this pay period/.test(preview1.text), preview1.text);

  // Cross-check the gross delta against the engine directly.
  const engineDelta = await page.evaluate((d) => {
    precalcFatigue(d.year, 'D');
    const before = computePPGross(d.pp, 'D', d.year);
    extraShifts[d.ds] = buildShiftPayload();
    invalidateFatigueCache(); precalcFatigue(d.year, 'D');
    const after = computePPGross(d.pp, 'D', d.year);
    delete extraShifts[d.ds]; invalidateFatigueCache();
    return after - before;
  }, days.off);
  const shownGross = parseFloat((preview1.text.match(/\+\$([\d.]+) gross/) || [])[1]);
  check('Preview gross matches computePPGross delta within $1', Math.abs(shownGross - engineDelta) <= 1,
        `shown=$${shownGross} engine=$${engineDelta.toFixed(2)}`);

  // Net should be positive but below gross (taxes withheld).
  const shownNet = parseFloat((preview1.text.match(/([+−])\$([\d.]+) net/) || [])[2]);
  check('Preview net is positive and below gross', shownNet > 0 && shownNet < shownGross, `net=$${shownNet}`);

  // ── 2. Preview leaves no phantom state behind ───────────────────────────────
  const phantom = await page.evaluate((ds) => extraShifts[ds] === undefined, days.off.ds);
  check('No phantom extraShifts entry after previewing', phantom);

  // ── 3. Off Day on a scheduled work day → negative delta ─────────────────────
  await page.evaluate(() => closeAllSheets());
  await page.evaluate((ds, shift) => { openPickupSheet(ds, 'Preview test 2', shift, 'O'); selectType('OffDay'); }, days.work.ds, days.work.shift);
  await wait(500);
  const preview2 = await page.evaluate(() => document.getElementById('pay-preview').textContent);
  check('Off Day override previews a negative delta', /^−\$/.test(preview2), preview2);

  // ── 4. saveShift still persists the built payload ───────────────────────────
  await page.evaluate(() => closeAllSheets());
  await page.evaluate((ds, shift) => {
    openPickupSheet(ds, 'Save test', shift, 'D');
    document.getElementById('input-start-time').value = '06:30';
    document.getElementById('input-end-time').value = '18:30';
    resetSliders(); updatePickupToggles();
    saveShift();
  }, days.off.ds, days.off.shift);
  await wait(200);
  const saved = await page.evaluate((ds) => extraShifts[ds] || null, days.off.ds);
  check('saveShift stores times + OT/DT classification as before',
        !!saved && saved.startTime === '06:30' && saved.endTime === '18:30' && ((saved.otHours || 0) + (saved.dtHours || 0)) === 12,
        JSON.stringify(saved));

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
