// Smoke tests for the fatigue/lockout engine (precalcFatigue in rotation.js):
//   • clean PP baseline (base hours, no lockouts)
//   • 120h/14-day cap: off days locked once the PP is full, sequential boundary
//     lockout when exceeded, pre-booked shifts beyond the boundary preserved
//   • 16h/24h window + 8h rest lockouts and their override flags
//   • overrideLockout clearing a 120h lock
// Run with: npm run test:fatigue

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

  // Pick a PP a few periods out whose 14 days sit inside one calendar year.
  const pp = await page.evaluate((crew) => {
    const lt = getLogicalToday();
    const nowUTC = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    let pi = Math.floor((nowUTC - basePPStartUTC) / MS_PP) + 2;
    for (; ; pi++) {
      const s = basePPStartUTC + pi * MS_PP;
      if (new Date(s).getUTCFullYear() === new Date(s + MS_PP_TO_END).getUTCFullYear()) break;
    }
    const s = basePPStartUTC + pi * MS_PP;
    const days = [];
    for (let d = 0; d <= 13; d++) {
      const u = s + d * MS_DAY;
      days.push({ d, ds: toDateKey(u), shift: getShiftForCrew(getPIndex(u), crew) });
    }
    return { pi, year: new Date(s + MS_PP_TO_END).getUTCFullYear(), days };
  }, CREW);

  const workDays = pp.days.filter(x => x.shift === 'D' || x.shift === 'N');
  const offDays  = pp.days.filter(x => x.shift === 'O');
  const baseHours = workDays.length * 12;
  check('Test PP found with base hours under the 120h cap', baseHours < 120 && offDays.length >= 4,
        `PP ${pp.pi} (${pp.days[0].ds}…${pp.days[13].ds}): ${workDays.length} work days = ${baseHours}h, ${offDays.length} off days`);

  // Helper: reset schedule, apply bookings, recompute, return dayFatigue slice for the PP.
  const runScenario = (bookings) => page.evaluate((bookings, year, crew, dayKeys) => {
    extraShifts = {};
    for (const [ds, ex] of Object.entries(bookings)) extraShifts[ds] = ex;
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
    invalidateFatigueCache();
    precalcFatigue(year, crew);
    const out = {};
    for (const ds of dayKeys) out[ds] = dayFatigue[ds];
    return out;
  }, bookings, pp.year, CREW, pp.days.map(x => x.ds));

  // ── Scenario 1: clean PP ────────────────────────────────────────────────────
  {
    const f = await runScenario({});
    const okBase = pp.days.every(x => f[x.ds] && f[x.ds].baseWorkHours === ((x.shift === 'O') ? 0 : 12));
    check('Clean PP: base hours match the rotation pattern', okBase);
    const noLocks = pp.days.every(x => !f[x.ds].isLockout && !f[x.ds].is16hLockout && !f[x.ds].isRestLockout);
    check('Clean PP: no lockouts of any kind', noLocks);
    check('Clean PP: day 13 flagged as PP boundary', f[pp.days[13].ds].isPPBoundary === true && f[pp.days[0].ds].isPPBoundary === false);
  }

  // ── Scenario 2: fill the PP to exactly 120h ─────────────────────────────────
  const pickup = { type: 'Day', startTime: '06:30', endTime: '18:30' };
  const needed = (120 - baseHours) / 12;
  const filled = {};
  for (let i = 0; i < needed; i++) filled[offDays[i].ds] = { ...pickup };
  {
    const f = await runScenario(filled);
    const remainingOff = offDays.slice(needed);
    const offLocked = remainingOff.every(x => f[x.ds].isLockout === true);
    check(`Full PP (120h): remaining ${remainingOff.length} off days are locked`, offLocked,
          remainingOff.map(x => `${x.ds}:${f[x.ds].isLockout}`).join(' '));
    const workedFree = pp.days.filter(x => x.shift !== 'O' || filled[x.ds])
                              .every(x => !f[x.ds].isLockout && f[x.ds].scheduledWorkHours === 12);
    check('Full PP (120h): all working/booked days keep their 12h (no lock)', workedFree);
  }

  // ── Scenario 3: exceed 120h — boundary lock + preservation of late bookings ─
  {
    // Book one more pickup than fits, placing the last one at the END of the PP
    // so it sits beyond the sequential boundary (pre-booked → preserved).
    const over = {};
    for (let i = 0; i < needed; i++) over[offDays[i].ds] = { ...pickup };
    const lastOff = offDays[offDays.length - 1];
    over[lastOff.ds] = { ...pickup };
    const f = await runScenario(over);

    const lockedDays = pp.days.filter(x => f[x.ds].isLockout);
    check('Over 120h: at least one day is locked out', lockedDays.length > 0,
          lockedDays.map(x => x.ds).join(' '));
    const lockedZeroed = lockedDays.every(x => f[x.ds].scheduledWorkHours === 0 && f[x.ds].baseWorkHours === 0);
    check('Over 120h: locked days contribute 0 hours', lockedZeroed);
    check('Over 120h: booking beyond the boundary is preserved (not locked)',
          f[lastOff.ds].isLockout === false && f[lastOff.ds].scheduledWorkHours === 12,
          `${lastOff.ds}: lock=${f[lastOff.ds].isLockout} sched=${f[lastOff.ds].scheduledWorkHours}`);

    // overrideLockout on a locked day clears the lock (book it with the flag).
    const victim = lockedDays[0];
    const over2 = { ...over, [victim.ds]: { type: 'Day', startTime: '06:30', endTime: '18:30', overrideLockout: true } };
    const f2 = await runScenario(over2);
    check('overrideLockout clears a 120h lock', f2[victim.ds].isLockout === false,
          `${victim.ds}: lock=${f2[victim.ds].isLockout}`);
  }

  // ── Scenario 4: 16h/24h window + 8h rest ────────────────────────────────────
  // Two consecutive off days (not preceded by a night): book day1 06:30–18:30,
  // then day2 starting 02:00 — inside day1's 24h window, >16h worked, <8h rest.
  const pair = await page.evaluate((crew) => {
    const lt = getLogicalToday();
    const base = Date.UTC(lt.getFullYear(), lt.getMonth(), lt.getDate());
    for (let i = 2; i < 90; i++) {
      const u = base + i * MS_DAY;
      const s0 = getShiftForCrew(getPIndex(u - MS_DAY), crew);
      const s1 = getShiftForCrew(getPIndex(u), crew);
      const s2 = getShiftForCrew(getPIndex(u + MS_DAY), crew);
      if (s0 !== 'N' && s1 === 'O' && s2 === 'O') return { d1: toDateKey(u), d2: toDateKey(u + MS_DAY), year: new Date(u).getUTCFullYear() };
    }
    return null;
  }, CREW);
  check('Found consecutive off-day pair for window tests', !!pair, JSON.stringify(pair));

  if (pair) {
    const winBase = {
      [pair.d1]: { type: 'Day', startTime: '06:30', endTime: '18:30' },
      [pair.d2]: { type: 'Day', startTime: '02:00', endTime: '08:00' }
    };
    const runPair = (bk) => page.evaluate((bk, year, crew, d2) => {
      extraShifts = {};
      for (const [ds, ex] of Object.entries(bk)) extraShifts[ds] = ex;
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(extraShifts));
      invalidateFatigueCache();
      precalcFatigue(year, crew);
      return dayFatigue[d2];
    }, bk, pair.year, CREW, pair.d2);

    const f1 = await runPair(winBase);
    check('>16h in 24h window sets is16hLockout', f1.is16hLockout === true, JSON.stringify(f1));
    check('<8h rest after the window violation sets isRestLockout', f1.isRestLockout === true);

    const f2 = await runPair({ ...winBase, [pair.d2]: { ...winBase[pair.d2], overrideRule16h: true } });
    check('overrideRule16h clears both window lockouts', !f2.is16hLockout && !f2.isRestLockout, JSON.stringify(f2));

    const f3 = await runPair({ ...winBase, [pair.d2]: { ...winBase[pair.d2], overrideRest: true } });
    check('overrideRest alone keeps is16hLockout but clears isRestLockout',
          f3.is16hLockout === true && !f3.isRestLockout, JSON.stringify(f3));
  }

  check('Zero console/page errors during fatigue scenarios', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
