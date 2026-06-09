// End-to-end smoke test for backup hardening (QR transfer + reminder).
// Camera scanning can't run headless, so this exercises the QR payload
// round-trip (compress→restore), QR rendering, and the reminder nudge.
// Run with: npm run test:backup

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'www');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json' };

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
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('raw.githubusercontent.com')) {
      return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ years: {} }) });
    }
    req.continue();
  });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Seed a known profile + a logged shift, mark onboarding seen.
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, displayName: 'BackupTester', defaultCrew: 'B', regRate: 51.23 }));
    localStorage.setItem('kingDrewShiftsV20', JSON.stringify({ '2026-06-10': { type: 'Day', otHours: 3 } }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  // Vendored libraries present
  const libs = await page.evaluate(() => ({ lz: typeof LZString, qr: typeof qrcode, jsqr: typeof jsQR }));
  check('LZString / qrcode / jsQR globals loaded', libs.lz === 'object' || libs.lz === 'function', `lz=${libs.lz} qr=${libs.qr} jsqr=${libs.jsqr}`);
  check('qrcode generator available', libs.qr === 'function');
  check('jsQR scanner available', libs.jsqr === 'function');

  // ── Native copy/paste menu suppressed (except inputs) ───────────────────────
  const sel = await page.evaluate(() => {
    const bodySel  = getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect;
    const inp = document.querySelector('input');
    const inpSel = inp ? (getComputedStyle(inp).webkitUserSelect || getComputedStyle(inp).userSelect) : 'text';
    // contextmenu prevented on a non-input element?
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('.app-header').dispatchEvent(ev);
    const prevented = ev.defaultPrevented;
    // ...but allowed inside an input
    const ev2 = new Event('contextmenu', { bubbles: true, cancelable: true });
    if (inp) inp.dispatchEvent(ev2);
    return { bodySel, inpSel, prevented, inputAllowed: inp ? !ev2.defaultPrevented : true };
  });
  check('Body text is not selectable (no long-press menu)', sel.bodySel === 'none', `body=${sel.bodySel}`);
  check('Inputs remain selectable/editable', sel.inpSel === 'text', `input=${sel.inpSel}`);
  check('contextmenu suppressed outside inputs', sel.prevented);
  check('contextmenu allowed inside inputs', sel.inputAllowed);

  // ── QR payload round-trip ───────────────────────────────────────────────────
  const payload = await page.evaluate(() => backupPayload());
  check('Backup payload is tagged + compressed', typeof payload === 'string' && payload.indexOf('SHB1:') === 0, `len=${payload.length}`);

  // Corrupt local state, then restore from the captured payload.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kingDrewSettingsV20'));
    s.displayName = 'WIPED'; s.defaultCrew = 'D';
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify(s));
    localStorage.setItem('kingDrewShiftsV20', JSON.stringify({}));
    sysSettings = JSON.parse(localStorage.getItem('kingDrewSettingsV20'));
    extraShifts = {};
  });
  const restored = await page.evaluate((p) => restoreFromPayload(p), payload);
  check('restoreFromPayload returns true for valid payload', restored === true);

  const after = await page.evaluate(() => ({
    name: sysSettings.displayName,
    crew: sysSettings.defaultCrew,
    rate: sysSettings.regRate,
    shift: !!(extraShifts['2026-06-10'])
  }));
  check('Restore recovered display name', after.name === 'BackupTester', `name=${after.name}`);
  check('Restore recovered crew + rate', after.crew === 'B' && after.rate === 51.23, `crew=${after.crew} rate=${after.rate}`);
  check('Restore recovered logged shift', after.shift === true);

  // Garbage payloads are rejected.
  const rejected = await page.evaluate(() => restoreFromPayload('not-a-backup') === false && restoreFromPayload('SHB1:@@bad@@') === false);
  check('Invalid payloads are rejected safely', rejected);

  // ── QR rendering ────────────────────────────────────────────────────────────
  await page.evaluate(() => showBackupQR());
  await wait(150);
  const qrImg = await page.evaluate(() => {
    const img = document.querySelector('#backup-qr img');
    return img ? (img.src || '').slice(0, 15) : null;
  });
  check('Transfer QR renders an image', qrImg && qrImg.startsWith('data:image'), `src=${qrImg}`);
  await page.evaluate(() => closeAllSheets(true));

  // ── QR sheet opens ON TOP of Settings, and Back returns to Settings ─────────
  await page.evaluate(() => openSettingsSheet());
  await wait(120);                       // let the settings sheet finish opening
  await page.evaluate(() => showBackupQR());
  await wait(200);
  const stack = await page.evaluate(() => {
    const z = el => parseInt(getComputedStyle(document.getElementById(el)).zIndex) || 0;
    return {
      qrActive: document.getElementById('sheet-backupqr').classList.contains('active'),
      qrAbove: z('sheet-backupqr') > z('sheet-settings')
    };
  });
  check('QR sheet opened from Settings is active', stack.qrActive);
  check('QR sheet paints above Settings (higher z-index)', stack.qrAbove);
  // Going back from the QR sheet should return to Settings, not home.
  await page.evaluate(() => sheetBack());
  await wait(350);
  const afterBack = await page.evaluate(() => ({
    qrActive: document.getElementById('sheet-backupqr').classList.contains('active'),
    settingsActive: document.getElementById('sheet-settings').classList.contains('active')
  }));
  check('Back from QR closes the QR sheet', !afterBack.qrActive);
  check('Back from QR returns to Settings (not home)', afterBack.settingsActive);
  await page.evaluate(() => closeAllSheets(true));

  // ── Reminder nudge ──────────────────────────────────────────────────────────
  await page.evaluate(() => {
    sysSettings.backupReminderDays = 7;
    sysSettings.lastBackupAt = Date.now() - 10 * 86400000; // 10 days ago → overdue
    sysSettings.lastBackupNudge = 0;
    maybeBackupReminder();
  });
  await wait(1500); // nudge is delayed ~1.2s
  const nudged = await page.evaluate(() => document.querySelectorAll('#toast-container .native-toast').length > 0);
  check('Overdue backup triggers a reminder toast', nudged);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
