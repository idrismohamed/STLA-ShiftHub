// Smoke test for the analytics Time Off rework: vacation is split out of the
// CPP/EI caps card, and Vacation / Holiday / Drop render as their own clickable
// rings that open a usage-detail sheet. Run with: npm run test:timeoff

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
    if (req.url().includes('raw.githubusercontent.com')) return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"years":{}}' });
    req.continue();
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Seed onboarding-seen + some time-off entries across 2026.
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, defaultCrew: 'B' }));
    localStorage.setItem('kingDrewShiftsV20', JSON.stringify({
      '2026-03-10': { type: 'Vacation', vacHours: 12 },
      '2026-04-02': { type: 'Vacation', vacHours: 12 },
      '2026-05-20': { type: 'Lieu' },
      '2026-02-14': { type: 'DropOff' },
      '2026-06-01': { type: 'DropPaid' }
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(400);

  // Ring counts: caps card has only CPP + EI; Time Off card has 3.
  const rings = await page.evaluate(() => ({
    caps: document.querySelectorAll('#chart-rings .ch-ring-cap').length,
    timeoff: document.querySelectorAll('#chart-timeoff .ch-ring-cap').length,
    capsText: (document.getElementById('chart-rings') || {}).textContent || ''
  }));
  check('CPP/EI caps card shows exactly 2 rings (no vacation)', rings.caps === 2, `caps=${rings.caps}`);
  check('Vacation is no longer in the caps card', !/Vacation/.test(rings.capsText));
  check('Time Off card shows 3 rings (Vacation/Holiday/Drop)', rings.timeoff === 3, `timeoff=${rings.timeoff}`);

  // Tapping the top summary card opens the relevant pay-period sheet.
  await page.evaluate(() => document.querySelector('.pp-top-tap').click());
  await wait(250);
  const topTap = await page.evaluate(() => document.getElementById('sheet-payroll').classList.contains('active'));
  check('Tapping the top summary card opens the pay-period sheet', topTap);
  await page.evaluate(() => closeAllSheets(true));
  await wait(200);

  // Tapping the Vacation ring opens the detail sheet with both vacation days.
  await page.evaluate(() => document.querySelectorAll('#chart-timeoff .ch-ring-cap')[0].click());
  await wait(250);
  const vac = await page.evaluate(() => ({
    active: document.getElementById('sheet-timeoff-detail').classList.contains('active'),
    title: document.getElementById('timeoff-detail-title').textContent,
    rows: document.querySelectorAll('#timeoff-detail-content .to-row').length
  }));
  check('Vacation ring opens the detail sheet', vac.active && /Vacation/.test(vac.title), `title=${vac.title}`);
  check('Detail lists both vacation days', vac.rows === 2, `rows=${vac.rows}`);

  // Back returns to the dashboard (home), then Drop ring lists 2 entries.
  await page.evaluate(() => sheetBack());
  await wait(350);
  await page.evaluate(() => openTimeOffDetail('drop'));
  await wait(250);
  const drop = await page.evaluate(() => ({
    rows: document.querySelectorAll('#timeoff-detail-content .to-row').length,
    hasPaid: /Paid/.test(document.getElementById('timeoff-detail-content').textContent),
    hasUnpaid: /Unpaid/.test(document.getElementById('timeoff-detail-content').textContent)
  }));
  check('Drop detail lists DropOff + DropPaid', drop.rows === 2 && drop.hasPaid && drop.hasUnpaid, `rows=${drop.rows}`);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
