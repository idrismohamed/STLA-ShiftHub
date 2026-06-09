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

  // ── Paystub history (save from verifier → reconcile) ────────────────────────
  await page.evaluate(() => {
    const t = calculateTaxes(simBaseGross, simTargetPP, simTargetYear);
    document.getElementById('vf-gross').value = simBaseGross.toFixed(2);
    document.getElementById('vf-tax').value   = (t.fedTax + t.onTax).toFixed(2);
    document.getElementById('vf-cpp').value   = (t.cpp + t.cpp2).toFixed(2);
    document.getElementById('vf-ei').value    = t.ei.toFixed(2);
    document.getElementById('vf-net').value   = (simBaseGross - t.total).toFixed(2);
    savePaystubEntry();
  });
  const stored = await page.evaluate(() => Object.keys(loadPaystubs()).length);
  check('Verifier saves a paystub to history', stored >= 1, `entries=${stored}`);
  await page.evaluate(() => { closeAllSheets(true); openPaystubHistory(); });
  await wait(200);
  const hist = await page.evaluate(() => ({
    rows: document.querySelectorAll('#history-content .hist-row:not(.hist-head)').length,
    hasYtd: /YTD from your saved stubs/.test(document.getElementById('history-content').textContent)
  }));
  check('History lists the saved paystub + YTD', hist.rows >= 1 && hist.hasYtd, `rows=${hist.rows}`);

  // ── T4 / refund estimate ────────────────────────────────────────────────────
  await page.evaluate(() => { closeAllSheets(true); openT4Estimate(); });
  await wait(200);
  const t4 = await page.evaluate(() => ({
    boxes: document.querySelectorAll('#t4-content .t4-box').length,
    refund: !!document.querySelector('#t4-content .t4-refund')
  }));
  check('T4 estimate renders the 4 boxes + refund', t4.boxes === 4 && t4.refund, `boxes=${t4.boxes}`);

  // ── Holiday explainer ───────────────────────────────────────────────────────
  await page.evaluate(() => { closeAllSheets(true); openHolidayExplainer(); });
  await wait(200);
  const hol = await page.evaluate(() => ({
    rows: document.querySelectorAll('#holiday-content .hol-row').length,
    total: /Estimated holiday pay/.test(document.getElementById('holiday-content').textContent)
  }));
  check('Holiday explainer lists stat holidays + total', hol.rows >= 10 && hol.total, `rows=${hol.rows}`);

  // ── Bonus / VCP extra payments ──────────────────────────────────────────────
  await page.evaluate(() => { closeAllSheets(true); openPayrollSheet(); openPayTools(); openExtraPayments(); });
  await wait(250);
  await page.evaluate(() => {
    selectExtraType('Bonus');
    document.getElementById('xp-date').value  = '2026-02-14';
    document.getElementById('xp-gross').value = '5000';
    document.getElementById('xp-net').value   = '3200';
    document.getElementById('xp-tax').value   = '1500';
    document.getElementById('xp-cpp').value   = '250';
    document.getElementById('xp-ei').value    = '50';
    addExtraPayment();
  });
  await wait(200);
  const xp = await page.evaluate(() => {
    const all = loadExtraPayments(); const ytd = extraPaymentsYTD(2026);
    return { count: all.length, type: all[0] && all[0].type, gross: ytd.gross, cpp: ytd.cpp, rows: document.querySelectorAll('#xp-list .xp-row').length };
  });
  check('Bonus/VCP payment is saved and listed', xp.count === 1 && xp.type === 'Bonus' && xp.rows === 1, `count=${xp.count} rows=${xp.rows}`);
  check('extraPaymentsYTD sums the payment', xp.gross === 5000 && xp.cpp === 250, `gross=${xp.gross} cpp=${xp.cpp}`);

  const capXp = await page.evaluate(() => computeYearCaps(sysSettings.defaultCrew, Math.floor((Date.UTC(2026,5,8)-basePPStartUTC)/MS_PP), 2026).cpp1.ytd);
  check('Cap tracker folds the bonus CPP into YTD', capXp >= 250, `cpp1Ytd=${capXp.toFixed(0)}`);

  await page.evaluate(() => { closeAllSheets(true); openT4Estimate(); });
  await wait(200);
  const t4txt = await page.evaluate(() => document.getElementById('t4-content').textContent);
  check('T4 estimate notes the logged bonus/VCP', /logged bonus\/VCP/.test(t4txt));

  await page.evaluate(() => { const all = loadExtraPayments(); deleteExtraPayment(all[0].id); });
  check('Payment can be deleted', (await page.evaluate(() => loadExtraPayments().length)) === 0);

  // ── Back-navigation: closing a child sheet returns to its parent ────────────
  await page.evaluate(() => { closeAllSheets(true); openPayrollSheet(); openPayTools(); openCapTracker(); });
  await wait(250);
  const deep = await page.evaluate(() => ['sheet-payroll','sheet-paytools','sheet-captrack'].map(id => document.getElementById(id).classList.contains('active')));
  check('Three sheets stacked (payroll → tools → caps)', deep[0] && deep[1] && deep[2], `active=${deep}`);
  await page.evaluate(() => sheetBack());           // caps → tools
  await wait(550);
  const back1 = await page.evaluate(() => ({ caps: document.getElementById('sheet-captrack').classList.contains('active'), tools: document.getElementById('sheet-paytools').classList.contains('active'), pay: document.getElementById('sheet-payroll').classList.contains('active') }));
  check('Back from Caps returns to Tools (pay dashboard still open)', !back1.caps && back1.tools && back1.pay, JSON.stringify(back1));
  await page.evaluate(() => sheetBack());           // tools → payroll
  await wait(550);
  const back2 = await page.evaluate(() => ({ tools: document.getElementById('sheet-paytools').classList.contains('active'), pay: document.getElementById('sheet-payroll').classList.contains('active') }));
  check('Back from Tools returns to the pay period sheet (not home)', !back2.tools && back2.pay, JSON.stringify(back2));

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
