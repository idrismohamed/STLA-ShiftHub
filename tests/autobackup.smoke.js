// Smoke test for the auto-backup safety net (www/autoBackup.js):
//   • a data change triggers a debounced snapshot into IndexedDB
//   • wiping localStorage and relaunching offers a one-tap restore
//   • the restore brings the shift data back
// Run with: npm run test:autobackup

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
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true, defaultCrew: 'D' }));
    return new Promise(res => { const rq = indexedDB.deleteDatabase('shifthub-autobackup'); rq.onsuccess = rq.onerror = rq.onblocked = () => res(); });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  // ── 1. A data change produces a snapshot ────────────────────────────────────
  const MARKER_DATE = '2026-09-15';
  await page.evaluate((ds) => {
    extraShifts[ds] = { type: 'Day', startTime: '06:30', endTime: '18:30', otReason: 'autobackup-test' };
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
    invalidateFatigueCache();
    dataChanged();
    autoSnapshot();          // flush immediately instead of waiting out the debounce
  }, MARKER_DATE);
  await wait(400);

  const snap = await page.evaluate(() => readAutoSnapshot());
  check('Snapshot written to IndexedDB after data change', !!(snap && snap.payload && snap.at), snap ? `at=${snap.at}, ${snap.payload.length} chars` : 'null');
  check('Snapshot payload uses the SHB1 backup format', !!snap && snap.payload.indexOf('SHB1:') === 0);

  const roundTrip = await page.evaluate(() => {
    return readAutoSnapshot().then(s => {
      const obj = JSON.parse(LZString.decompressFromBase64(s.payload.slice(5)));
      return JSON.parse(obj.shifts);
    });
  });
  check('Snapshot contains the saved shift', !!(roundTrip && roundTrip[MARKER_DATE] && roundTrip[MARKER_DATE].otReason === 'autobackup-test'));

  // ── 2. Wiped localStorage + relaunch → restore offer appears ────────────────
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1600);   // maybeRestoreFromSnapshot runs ~800ms after launch

  const offer = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.toast-undo-btn')].find(b => b.textContent === 'RESTORE');
    return btn ? (btn.previousSibling ? btn.previousSibling.textContent : 'found') : null;
  });
  check('Restore offer appears when data is missing', !!offer, offer || 'no RESTORE toast');

  const emptyBefore = await page.evaluate(() => Object.keys(extraShifts).length);
  check('Shift data is empty before restore', emptyBefore === 0, `keys=${emptyBefore}`);

  // ── 3. Tapping RESTORE brings the data back ─────────────────────────────────
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.toast-undo-btn')].find(b => b.textContent === 'RESTORE');
    if (btn) btn.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
  await wait(400);

  const restored = await page.evaluate((ds) => extraShifts[ds] || null, MARKER_DATE);
  check('Restore recovers the shift after reload', !!(restored && restored.otReason === 'autobackup-test'), JSON.stringify(restored));

  // ── 4. No offer when data already exists ────────────────────────────────────
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1600);
  const noOffer = await page.evaluate(() => ![...document.querySelectorAll('.toast-undo-btn')].some(b => b.textContent === 'RESTORE'));
  check('No restore offer when data is present', noOffer);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
