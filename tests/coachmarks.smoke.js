// Smoke test for the first-run guided coachmark tour.
// Run with: npm run test:coach

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
  const title = () => page.$eval('.coach-title', el => el.textContent).catch(() => '');

  // Existing user (onboarding seen, coachmarks not) → tour auto-starts.
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingDrewSettingsV20', JSON.stringify({ hasSeenOnboarding: true, defaultCrew: 'B' })); });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1300);

  const active = await page.evaluate(() => document.getElementById('coach-root') && document.getElementById('coach-root').classList.contains('active'));
  check('Tour auto-starts for existing users', active);
  check('First step is the pay period', /pay period/i.test(await title()), `title=${await title()}`);
  const prog = await page.$eval('.coach-progress', el => el.textContent).catch(() => '');
  check('Shows step progress (5 steps)', /of 5/.test(prog), `prog=${prog}`);
  const hole = await page.evaluate(() => { const h = document.querySelector('.coach-hole'); return { w: parseFloat(h.style.width), h: parseFloat(h.style.height) }; });
  check('Spotlight hole has a size', hole.w > 0 && hole.h > 0, `${hole.w}x${hole.h}`);

  // Step through the whole tour.
  const seen = [await title()];
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.querySelector('.coach-next').click()); await wait(500); seen.push(await title()); }
  check('Tour advances through distinct steps', new Set(seen).size === 5, seen.join(' | '));
  check('Last step is Settings', /settings/i.test(seen[seen.length - 1]), seen[seen.length - 1]);
  const lastBtn = await page.$eval('.coach-next', el => el.textContent);
  check('Final step button reads "Done"', lastBtn === 'Done', `btn=${lastBtn}`);

  await page.evaluate(() => document.querySelector('.coach-next').click()); // Done
  await wait(200);
  const ended = await page.evaluate(() => ({ active: document.getElementById('coach-root').classList.contains('active'), seen: JSON.parse(localStorage.getItem('kingDrewSettingsV20')).hasSeenCoachmarks }));
  check('Finishing closes the tour and records it as seen', !ended.active && ended.seen === true);

  // Returning user → tour does NOT reappear.
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(1300);
  check('Tour does not reappear once seen', !(await page.evaluate(() => document.getElementById('coach-root') && document.getElementById('coach-root').classList.contains('active'))));

  // Replay from Settings.
  await page.evaluate(() => replayCoachmarks());
  await wait(600);
  check('Replay re-opens the tour', await page.evaluate(() => document.getElementById('coach-root').classList.contains('active')));

  check('Zero console/page errors during flow', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(2); });
