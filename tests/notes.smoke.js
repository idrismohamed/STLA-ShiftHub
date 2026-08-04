// Smoke test for shift notes (Phase: on-shift notification + notes):
//   • add a note from the pickup sheet, it renders and persists
//   • re-saving the day's form keeps existing notes (merge, not overwrite)
//   • notes survive a backup → restore round trip
//   • deleting a note works and clears empty husk entries
// The notification path itself is Cordova-only and guarded; this covers the
// shared data model and sheet UI in the browser.
// Run with: npm run test:notes

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

  // A scheduled working day in the next 28 days.
  const day = await page.evaluate(() => {
    const lt = getLogicalToday();
    const base = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    for (let i = 1; i < 28; i++) {
      const u = base + i * 86400000;
      const s = getShiftForCrew(getPIndex(u), 'D');
      if (s === 'D' || s === 'N') return { ds: toDateKey(u), shift: s };
    }
    return null;
  });
  check('Found a working day for the test', !!day, JSON.stringify(day));

  // ── 1. Add a note from the sheet UI ─────────────────────────────────────────
  await page.evaluate((d) => {
    openPickupSheet(d.ds, 'Notes test', d.shift, 'O');
    document.getElementById('input-note').value = 'Covered line 2 for Mo';
    addNoteFromForm();
  }, day);
  await wait(150);

  const afterAdd = await page.evaluate((ds) => ({
    stored: (extraShifts[ds] || {}).notes || null,
    rendered: document.getElementById('notes-list').textContent,
    inLocalStorage: JSON.parse(localStorage.getItem(STORAGE_KEYS.SHIFTS))[ds]?.notes?.length || 0
  }), day.ds);
  check('Note stored on the day', !!afterAdd.stored && afterAdd.stored.length === 1 && afterAdd.stored[0].text === 'Covered line 2 for Mo', JSON.stringify(afterAdd.stored));
  check('Note rendered in the sheet list', /Covered line 2 for Mo/.test(afterAdd.rendered));
  check('Note persisted to localStorage', afterAdd.inLocalStorage === 1);

  // ── 2. Re-saving the form keeps the notes ───────────────────────────────────
  await page.evaluate(() => {
    document.getElementById('input-start-time').value = '06:30';
    document.getElementById('input-end-time').value = '18:30';
    resetSliders(); updatePickupToggles();
    saveShift();
  });
  await wait(150);
  const afterSave = await page.evaluate((ds) => extraShifts[ds] || null, day.ds);
  check('Re-saving the day keeps the note (merge, not overwrite)',
        !!afterSave && !!afterSave.notes && afterSave.notes.length === 1 && afterSave.startTime === '06:30',
        JSON.stringify(afterSave));

  // ── 3. Notes survive a backup → restore round trip ──────────────────────────
  const roundTrip = await page.evaluate((ds) => {
    const payload = JSON.parse(JSON.stringify(buildBackupData()));
    extraShifts = {}; localStorage.removeItem(STORAGE_KEYS.SHIFTS);
    applyBackupObject(payload);
    return (extraShifts[ds] || {}).notes || null;
  }, day.ds);
  check('Notes survive backup → restore', !!roundTrip && roundTrip.length === 1 && roundTrip[0].text === 'Covered line 2 for Mo', JSON.stringify(roundTrip));

  // ── 4. Delete note; husk entries get cleaned up ─────────────────────────────
  await page.evaluate((d) => { openPickupSheet(d.ds, 'Notes test', d.shift, 'O'); }, day);
  const noteAt = await page.evaluate((ds) => extraShifts[ds].notes[0].at, day.ds);
  await page.evaluate((ds, at) => deleteShiftNote(ds, at), day.ds, noteAt);
  await wait(150);
  const afterDelete = await page.evaluate((ds) => ({
    notes: (extraShifts[ds] || {}).notes || null,
    entryKept: !!extraShifts[ds],
    listEmpty: document.getElementById('notes-list').textContent === ''
  }), day.ds);
  check('Deleting the note removes it', afterDelete.notes === null && afterDelete.listEmpty, JSON.stringify(afterDelete));
  check('Day entry with real shift data is kept after note deletion', afterDelete.entryKept);

  // Husk cleanup: a note-only entry disappears entirely once its notes go.
  const huskGone = await page.evaluate(() => {
    const ds = '2099-01-15';
    addShiftNote(ds, 'temp');
    const at = extraShifts[ds].notes[0].at;
    deleteShiftNote(ds, at);
    return extraShifts[ds] === undefined;
  });
  check('Note-only husk entry is dropped when its last note is deleted', huskGone);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
