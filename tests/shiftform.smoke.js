// Smoke test for the single-day 16h booking lockout in the shift form.
// Run with: npm run test:shiftform

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

  // Helper: open the shift form for a SCHEDULED Day (no explicit type tap, so
  // selectedType stays null — the real scenario) and modify the main times.
  const setShift = (start, end) => page.evaluate((start, end) => {
    openPickupSheet('2026-07-15', 'Wed Jul 15', 'D', 'O'); // prefills 06:30/18:30
    document.getElementById('input-start-time').value = start;
    document.getElementById('input-end-time').value = end;
    const cb = document.getElementById('cb-override'); if (cb) cb.checked = false;
    updatePickupToggles();
  }, start, end);
  const saveState = () => page.evaluate(() => ({
    disabled: document.getElementById('btn-save').disabled,
    warns16: /16H LIMIT/.test(document.getElementById('conflict-text').innerHTML),
    overrideShown: document.getElementById('override-label').style.display !== 'none'
  }));

  // A normal 12h day is allowed.
  await setShift('06:30', '18:30');
  await wait(120);
  let s = await saveState();
  check('Normal 12h shift can be saved', s.disabled === false, `disabled=${s.disabled}`);

  // 18h on one day is blocked and prompts the override.
  await setShift('06:30', '00:30'); // 18h
  await wait(120);
  s = await saveState();
  check('Booking >16h blocks save', s.disabled === true, `disabled=${s.disabled}`);
  check('Shows the 16H LIMIT warning', s.warns16);
  check('Shows the override checkbox', s.overrideShown);

  // Checking the override unlocks save.
  await page.evaluate(() => { document.getElementById('cb-override').checked = true; updatePickupToggles(); });
  await wait(120);
  s = await saveState();
  check('Override unlocks save for the >16h day', s.disabled === false, `disabled=${s.disabled}`);

  // Exactly 16h is allowed without override.
  await setShift('06:30', '22:30'); // 16h
  await wait(120);
  s = await saveState();
  check('Exactly 16h is allowed without override', s.disabled === false && !s.warns16, `disabled=${s.disabled}`);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
