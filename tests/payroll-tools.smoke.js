// End-to-end smoke test for the YTD cap tracker + paystub verifier.
// Serves www/ and drives the features in headless Chromium via Puppeteer.
// Run with: npm run test:payroll

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

  // Mark onboarding seen so the wizard doesn't cover the app, then load.
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  // Open the pay dashboard programmatically (sets simBaseGross/PP/year).
  await page.evaluate(() => openPayrollSheet());
  await wait(200);
  const simGross = await page.evaluate(() => simBaseGross);
  check('Pay dashboard sets a non-zero gross from the schedule', simGross > 0, `gross=$${simGross.toFixed(0)}`);

  // ── Cap tracker ───────────────────────────────────────────────────────────
  await page.evaluate(() => openCapTracker());
  await wait(200);
  const cap = await page.evaluate(() => {
    const rows = document.querySelectorAll('#captrack-content .cap-row').length;
    const fills = [...document.querySelectorAll('.cap-bar-fill')].map(f => f.style.width);
    const foot = !!document.querySelector('.cap-foot');
    return { rows, fills, foot };
  });
  check('Cap tracker renders CPP/CPP2/EI rows', cap.rows >= 2, `rows=${cap.rows}`);
  check('Cap bars have a computed width', cap.fills.some(w => w && w !== '0%'), `widths=${cap.fills.join(',')}`);
  check('Cap tracker shows the cheque-bump footer', cap.foot);

  // Validate the projection math directly.
  const capMath = await page.evaluate(() => {
    const crew = sysSettings.defaultCrew;
    const cur = Math.floor((Date.UTC(2026,5,8) - basePPStartUTC) / MS_PP);
    const c = computeYearCaps(crew, cur, 2026);
    return { cpp1Ytd: c.cpp1.ytd, cpp1Max: c.cpp1.max, cpp1Pct: c.cpp1.pct, eiPerPP: c.ei.perPP, bump: c.bump, stop: c.cpp1.stopIdx };
  });
  check('CPP1 YTD is positive and below max', capMath.cpp1Ytd > 0 && capMath.cpp1Ytd <= capMath.cpp1Max, `ytd=$${capMath.cpp1Ytd.toFixed(0)}/${capMath.cpp1Max}`);
  check('Cheque-bump is positive', capMath.bump > 0, `bump=$${capMath.bump.toFixed(2)}`);
  check('CPP1 projects a stop pay period', capMath.stop === null || capMath.stop > 0, `stopIdx=${capMath.stop}`);

  // ── Paystub verifier ────────────────────────────────────────────────────────
  await page.evaluate(() => { closeAllSheets(true); openPayrollSheet(); openVerifySheet(); });
  await wait(200);
  const appVals = await page.evaluate(() => {
    const t = calculateTaxes(simBaseGross, simTargetPP, simTargetYear);
    return { gross: simBaseGross, net: simBaseGross - t.total };
  });
  // Enter a "matching" gross and net, and a clearly-wrong CPP.
  await page.evaluate((g, n) => {
    document.getElementById('vf-gross').value = g.toFixed(2);
    document.getElementById('vf-net').value   = n.toFixed(2);
    document.getElementById('vf-cpp').value   = '0.01'; // wildly off → should flag
    runPaystubCompare();
  }, appVals.gross, appVals.net);
  await wait(150);
  const vf = await page.evaluate(() => ({
    okRows: document.querySelectorAll('#vf-results .vf-row.ok').length,
    badRows: document.querySelectorAll('#vf-results .vf-row.bad').length,
    verdictBad: !!document.querySelector('.vf-verdict.bad'),
    html: document.getElementById('vf-results').textContent.slice(0, 0)
  }));
  check('Verifier marks matching lines OK', vf.okRows >= 2, `okRows=${vf.okRows}`);
  check('Verifier flags the wrong CPP line', vf.badRows >= 1, `badRows=${vf.badRows}`);
  check('Verifier shows a discrepancy verdict', vf.verdictBad);

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
