// Smoke test for the ICS calendar export (www/icsExport.js):
//   • valid VCALENDAR structure with CRLF line endings
//   • a scheduled Day shift gets a 06:30–18:30 timed event
//   • a Night shift's DTEND crosses midnight into the next day
//   • extraShifts overrides (custom times, Vacation, OffDay) are reflected
// Run with: npm run test:ics

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

  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, hasSeenCoachmarks: true, defaultCrew: 'D' })); });
  await page.reload({ waitUntil: 'networkidle0' });

  const CREW = 'D';

  // Locate one Day, one Night and two Off days in the next 28 days.
  const days = await page.evaluate((crew) => {
    const lt = getLogicalToday();
    const base = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    let day = null, night = null, off1 = null, off2 = null;
    for (let i = 1; i < 28; i++) {
      const u = base + i * 86400000;
      const s = getShiftForCrew(getPIndex(u), crew);
      const ds = toDateKey(u);
      if (s === 'D' && !day)   day = ds;
      else if (s === 'N' && !night) night = ds;
      else if (s === 'O' && !off1)  off1 = ds;
      else if (s === 'O' && !off2)  off2 = ds;
    }
    return { day, night, off1, off2, from: base + 86400000, to: base + 28 * 86400000 };
  }, CREW);
  check('Found Day/Night/Off sample days', !!(days.day && days.night && days.off1 && days.off2), JSON.stringify(days));

  // ── 1. Clean schedule export ────────────────────────────────────────────────
  const ics1 = await page.evaluate((d, crew) => { extraShifts = {}; invalidateFatigueCache(); return buildICS(crew, d.from, d.to); }, days, CREW);

  check('Starts with BEGIN:VCALENDAR and ends with END:VCALENDAR',
        ics1.startsWith('BEGIN:VCALENDAR') && ics1.trimEnd().endsWith('END:VCALENDAR'));
  check('Uses CRLF line endings', ics1.includes('\r\n') && !/[^\r]\n/.test(ics1));
  check('Contains VEVENTs', (ics1.match(/BEGIN:VEVENT/g) || []).length >= 10, `${(ics1.match(/BEGIN:VEVENT/g) || []).length} events`);

  const dayKey = days.day.replace(/-/g, '');
  check('Day shift starts 06:30', ics1.includes(`DTSTART:${dayKey}T063000`), `looked for DTSTART:${dayKey}T063000`);
  check('Day shift ends 18:30 same day', ics1.includes(`DTEND:${dayKey}T183000`));

  const nightKey = days.night.replace(/-/g, '');
  const nightNextKey = (() => { const [y, m, d] = days.night.split('-').map(Number); const t = new Date(y, m - 1, d + 1); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`; })();
  check('Night shift starts 18:30', ics1.includes(`DTSTART:${nightKey}T183000`));
  check('Night shift ends 06:30 the NEXT day', ics1.includes(`DTEND:${nightNextKey}T063000`));

  check('Off days produce no events', !ics1.includes(`shifthub-${days.off1}@`));

  // ── 2. Overrides reflected ──────────────────────────────────────────────────
  const ics2 = await page.evaluate((d, crew) => {
    extraShifts = {};
    extraShifts[d.day]  = { type: 'Day', startTime: '10:00', endTime: '20:00' };   // custom times
    extraShifts[d.off1] = { type: 'Vacation' };                                     // all-day vacation
    extraShifts[d.night] = { type: 'OffDay' };                                      // neutral off
    extraShifts[d.off2] = { type: 'Day', startTime: '06:30', endTime: '18:30', otHours: 0, dtHours: 12 }; // OT pickup
    invalidateFatigueCache();
    return buildICS(crew, d.from, d.to);
  }, days, CREW);

  check('Custom shift times override the default', ics2.includes(`DTSTART:${dayKey}T100000`) && ics2.includes(`DTEND:${dayKey}T200000`));
  check('Vacation appears as an all-day event', ics2.includes(`DTSTART;VALUE=DATE:${days.off1.replace(/-/g, '')}`) && /Vacation/.test(ics2));
  check('OffDay override removes the scheduled night event', !ics2.includes(`DTSTART:${nightKey}T183000`));
  check('OT pickup on an off day appears with an OT tag', ics2.includes(`shifthub-${days.off2}@`) && /12h OT/.test(ics2));

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
