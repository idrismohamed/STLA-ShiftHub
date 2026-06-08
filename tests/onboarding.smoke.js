// End-to-end smoke test for the first-run onboarding wizard.
// Serves www/ over a throwaway HTTP server and drives the flow in headless
// Chromium via Puppeteer. Run with: npm run test:onboarding
//
// Requires puppeteer (devDependency). Pre-existing/environmental console noise
// (blocked CDN/tax-table fetches, Chart.js empty-data SVG warnings) is ignored;
// only onboarding-related page errors fail the run.

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'www');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json' };

// Static server. cordova.js is absent in a browser context, so stub it to avoid
// a spurious 404 in the console.
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

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  const clickByText = (sel, text) => page.evaluate((sel, text) => {
    const node = [...document.querySelectorAll(sel)].find(n => n.textContent.trim() === text);
    if (!node) return false; node.click(); return true;
  }, sel, text);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const cardMatches = re => page.$eval('.ob-card', (el, s) => new RegExp(s, 'i').test(el.textContent), re.source).catch(() => false);

  // 1. First run: wizard auto-opens
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  check('First run: onboarding overlay is active', await page.evaluate(() => document.getElementById('onboarding-root')?.classList.contains('active')));
  check('First run: welcome step rendered', await cardMatches(/Welcome to Shift Hub/));

  // 2. Welcome -> Name
  check('Click "Get started"', await clickByText('.ob-card button', 'Get started'));
  await wait(350);
  await page.type('.ob-input', 'Smoke Tester');

  // 3. Name -> Role
  check('Name -> Next', await clickByText('.ob-card button', 'Next'));
  await wait(350);
  check('Role step rendered', await cardMatches(/role & pay rate/));

  // 4. Role -> Crew, use detector with "Off" today
  await clickByText('.ob-card button', 'Next'); await wait(350);
  check('Crew step rendered', await cardMatches(/Find your crew/));
  await clickByText('.ob-card .toggle-btn', 'Help me find it'); await wait(100);
  await clickByText('.ob-card .toggle-btn', '🚫 Off'); await wait(200);
  const det = await page.evaluate(() => ({
    hit: !!document.querySelector('.ob-detect-hit'),
    cands: document.querySelectorAll('.ob-cand-card').length,
    cells: document.querySelectorAll('.ob-preview-cell').length
  }));
  check('Detector produced a result', det.hit || det.cands > 0, `hit=${det.hit} candidates=${det.cands}`);
  check('Live preview cells rendered', det.cells >= 14, `cells=${det.cells}`);
  if (det.cands > 0) { await page.evaluate(() => document.querySelector('.ob-cand-card').click()); await wait(100); }

  // 5. Crew -> Preview -> Notifications -> Theme -> CalSync
  const advance = async (re, label) => { await clickByText('.ob-card button', 'Next'); await wait(350); check(label, await cardMatches(re)); };
  await advance(/your schedule/, 'Preview step rendered');
  await advance(/shift reminders/, 'Notifications step rendered');
  await advance(/pick your look/, 'Theme step rendered');
  await clickByText('.ob-card .toggle-btn', '☀️ Light'); await wait(100);
  check('Theme applies live', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
  await advance(/sync to your phone/, 'Calendar sync step rendered');

  // 6. Finish -> Success -> persistence -> Open calendar
  check('Click "Finish"', await clickByText('.ob-card button', 'Finish'));
  await wait(350);
  check('Success step rendered', await cardMatches(/You're set/));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kingDrewSettingsV20') || '{}'));
  check('Persisted: hasSeenOnboarding', stored.hasSeenOnboarding === true);
  check('Persisted: displayName', stored.displayName === 'Smoke Tester', `name=${stored.displayName}`);
  check('Persisted: theme=light', stored.theme === 'light');
  check('Persisted: crew set', ['A','B','C','D'].includes(stored.defaultCrew), `crew=${stored.defaultCrew}`);
  check('Click "Open my calendar"', await clickByText('.ob-card button', 'Open my calendar'));
  await wait(400);
  check('Overlay closes after finishing', await page.evaluate(() => !document.getElementById('onboarding-root')?.classList.contains('active')));
  check('Greeting updated', (await page.$eval('#greeting-text', el => el.textContent.trim()).catch(() => '')) === 'Smoke Tester');

  // 7. Returning user
  await page.reload({ waitUntil: 'networkidle0' }); await wait(400);
  check('Returning user: wizard does NOT reappear', !(await page.evaluate(() => document.getElementById('onboarding-root')?.classList.contains('active'))));

  // 8. Resume mid-flow
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kingDrewSettingsV20')); s.hasSeenOnboarding = false; s.onboardingStep = 3; localStorage.setItem('kingDrewSettingsV20', JSON.stringify(s)); });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(400);
  check('Resume: reopens at saved step', await cardMatches(/Find your crew/));

  const IGNORE = [/ERR_CERT_AUTHORITY_INVALID/, /Failed to load resource/, /<rect> attribute (width|height)/, /negative value is not valid/];
  const relevant = errors.filter(e => !IGNORE.some(re => re.test(e)));
  check('No onboarding-related page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
