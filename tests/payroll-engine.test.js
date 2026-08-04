// Unit tests for the payroll engine (no browser). Loads the real constants.js,
// state.js and payroll.js into a vm sandbox with minimal stubs and pins the
// numeric behaviour of calculateTaxes() so future edits can't silently break it.
// Run with: npm run test:engine

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const WWW = path.join(__dirname, '..', 'www');
const read = f => fs.readFileSync(path.join(WWW, f), 'utf8');

// Sandbox: stub the browser bits the calc code touches at load time.
const sandbox = {
  console,
  Date, Math, JSON, parseInt, parseFloat, isNaN,
  localStorage: { getItem: () => null, setItem: () => {} },
  // state.js loads persisted state via safeParse — return the fallback so we get
  // clean defaults (sysSettings = {} → initDefaults fills it).
  safeParse: (key, fallback) => fallback
};
vm.createContext(sandbox);

// Load only the files the engine needs, in dependency order.
vm.runInContext(read('constants.js'), sandbox, { filename: 'constants.js' });
vm.runInContext(read('state.js'),     sandbox, { filename: 'state.js' });
vm.runInContext(read('payroll.js'),   sandbox, { filename: 'payroll.js' });
// `let` bindings (sysSettings) don't attach to the context object — expose it.
vm.runInContext('this.sysSettings = sysSettings;', sandbox);

const { calculateTaxes, getPayPeriodsInYear, getTaxYear, sysSettings } = sandbox;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('✅ ' + name); }
  catch (e) { failed++; console.log('❌ ' + name + ' — ' + e.message); }
}
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);

const YEAR = 2026;
const tbl = getTaxYear(YEAR);
const ppCount = getPayPeriodsInYear(YEAR);

t('Sane pay-period count (~26)', () => assert.ok(ppCount >= 24 && ppCount <= 27, `ppCount=${ppCount}`));

t('Tax table has the expected 2026 constants', () => {
  for (const k of ['fedBPA','onBPA','cppRate','annCPPMax','ympe','cpp2Rate','annCPP2Max','yampe','eiRate','annEIMax'])
    assert.ok(typeof tbl[k] === 'number', `missing ${k}`);
  near(tbl.cppRate, 0.0595); near(tbl.eiRate, 0.0163);
});

t('CPP1 matches the closed-form (mid income, under caps)', () => {
  const g = 2500;
  const r = calculateTaxes(g, 0, YEAR);
  const expected = Math.max(0, Math.min(g, tbl.ympe / ppCount) - (3500 / ppCount)) * tbl.cppRate;
  near(r.cpp, expected);
});

t('EI matches rate × gross (under cap)', () => {
  const g = 2500;
  near(calculateTaxes(g, 0, YEAR).ei, g * tbl.eiRate);
});

t('CPP2 engages only above YMPE annually', () => {
  const low  = calculateTaxes(1000, 0, YEAR);   // 1000×26 = 26k < YMPE → no CPP2
  assert.strictEqual(low.cpp2, 0);
  const high = calculateTaxes(4000, 0, YEAR);   // 4000×26 = 104k > YMPE → CPP2 applies
  assert.ok(high.cpp2 > 0, 'expected CPP2 > 0 at high income');
});

t('Per-pay caps stop CPP/EI at/after the configured pay period', () => {
  sysSettings.cppMaxPP = 5; sysSettings.cpp2MaxPP = 5; sysSettings.eiMaxPP = 5;
  const stopped = calculateTaxes(2500, 5, YEAR); // ppI >= cap
  assert.strictEqual(stopped.cpp, 0);
  assert.strictEqual(stopped.ei, 0);
  const active = calculateTaxes(2500, 4, YEAR);  // ppI < cap
  assert.ok(active.cpp > 0 && active.ei > 0);
  sysSettings.cppMaxPP = 9999; sysSettings.cpp2MaxPP = 9999; sysSettings.eiMaxPP = 9999; // reset
});

t('total equals the sum of all deductions', () => {
  const r = calculateTaxes(3000, 0, YEAR);
  near(r.total, r.cpp + r.cpp2 + r.ei + r.fedTax + r.onTax);
});

t('Tax is monotonic in gross', () => {
  const a = calculateTaxes(1500, 0, YEAR);
  const b = calculateTaxes(3000, 0, YEAR);
  assert.ok((b.fedTax + b.onTax) > (a.fedTax + a.onTax), 'higher gross should mean more tax');
});

t('Zero gross yields zero deductions', () => {
  const r = calculateTaxes(0, 0, YEAR);
  near(r.cpp, 0); near(r.ei, 0); near(r.fedTax, 0); near(r.onTax, 0); near(r.total, 0);
});

t('Net (gross − total) is positive and below gross for a normal cheque', () => {
  const g = 2800;
  const r = calculateTaxes(g, 0, YEAR);
  assert.ok(g - r.total > 0 && g - r.total < g);
});

// ─── Golden regression values (captured before the bracket-table refactor) ────
// These pin the exact outputs of the pre-refactor engine for 2024–2026 so the
// year-driven bracket tables can never silently change historical results.
const GOLDEN = [
  { g: 2500, pp: 0,  y: 2024, cpp: 140.7404, cpp2: 0,       ei: 41.5,  fedTax: 248.5582,  onTax: 133.6174 },
  { g: 2500, pp: 0,  y: 2025, cpp: 140.7404, cpp2: 0,       ei: 41,    fedTax: 245.9796,  onTax: 132.9086 },
  { g: 2500, pp: 0,  y: 2026, cpp: 141.037,  cpp2: 0,       ei: 40.75, fedTax: 253.0715,  onTax: 135.6634 },
  { g: 4000, pp: 3,  y: 2026, cpp: 156.6833, cpp2: 15.4074, ei: 65.2,  fedTax: 556.1056,  onTax: 283.7699 },
  { g: 6000, pp: 10, y: 2026, cpp: 156.6833, cpp2: 15.4074, ei: 97.8,  fedTax: 1057.6806, onTax: 648.1631 },
  { g: 1200, pp: 0,  y: 2025, cpp: 63.3904,  cpp2: 0,       ei: 19.68, fedTax: 61.6009,   onTax: 43.1848 },
  { g: 3200, pp: 20, y: 2024, cpp: 148.75,   cpp2: 7.2308,  ei: 53.12, fedTax: 389.9245,  onTax: 202.6669 }
];

t('Golden regression: 2024–2026 outputs unchanged after bracket refactor', () => {
  for (const c of GOLDEN) {
    const r = calculateTaxes(c.g, c.pp, c.y);
    for (const k of ['cpp', 'cpp2', 'ei', 'fedTax', 'onTax']) {
      assert.ok(Math.abs(r[k] - c[k]) <= 0.01, `${c.y} g=${c.g} ${k}: expected ${c[k]}, got ${r[k].toFixed(4)}`);
    }
  }
});

// ─── 2027 (estimated tables) ──────────────────────────────────────────────────

t('2027 table resolves with bracket data and estimated flag', () => {
  const t27 = getTaxYear(2027);
  assert.ok(t27.estimated === true, 'expected estimated flag');
  assert.ok(Array.isArray(t27.fedBrackets) && Array.isArray(t27.onBrackets), 'expected bracket arrays');
  assert.ok(t27.fedBPA > getTaxYear(2026).fedBPA, '2027 BPA should exceed 2026');
});

t('2027 deductions are sane and monotonic in gross', () => {
  let prev = -1;
  for (const g of [1000, 2000, 3000, 4500, 6000]) {
    const r = calculateTaxes(g, 0, 2027);
    const totalTax = r.fedTax + r.onTax;
    assert.ok(totalTax >= prev, `tax not monotonic at g=${g}`);
    assert.ok(r.total < g, `deductions exceed gross at g=${g}`);
    assert.ok(r.cpp >= 0 && r.cpp2 >= 0 && r.ei >= 0, 'negative contribution');
    prev = totalTax;
  }
});

t('2027 indexation lowers tax slightly vs 2026 at equal gross', () => {
  const a = calculateTaxes(2800, 0, 2026);
  const b = calculateTaxes(2800, 0, 2027);
  assert.ok((b.fedTax + b.onTax) < (a.fedTax + a.onTax), 'indexed brackets/BPA should reduce tax');
});

t('Unknown future year falls back to the latest built-in table', () => {
  const far = getTaxYear(2030);
  assert.strictEqual(far, getTaxYear(2027));
});

console.log(`\n${passed}/${passed + failed} engine checks passed.`);
process.exit(failed ? 1 : 0);
