# STLA ShiftHub — Complete Rebuild Specification

> A self-contained spec to rebuild the app from scratch. It describes **what** the app does and **how** every rule works, with exact numbers. Implementation language/framework is up to you, but the domain math and business rules below must be reproduced exactly or pay will be wrong.

---

## 1. What the app is

**STLA ShiftHub** is a personal, single-user, **offline-first mobile app (PWA)** for **Stellantis (STLA) automotive factory workers** who work a **rotating 28-day crew schedule** (Day / Night / Off). It does four things:

1. **Shows the rotating schedule** on a calendar (month / week / year).
2. **Logs shifts and extra hours** (overtime, vacation, dropped days, etc.).
3. **Calculates Canadian (Ontario) payroll** per 14-day pay period — gross, all deductions (CPP, CPP2, EI, federal + Ontario tax), and net — plus year-to-date analytics and projections.
4. **Generates a paystub PDF** and helps the worker **trust/verify their real pay** (paystub verifier, contribution-cap tracker, T4/refund estimate).

There is **no backend and no login** — all data lives in the browser's `localStorage` on the device. Everything works fully offline. Optional remote calls: a tax-table refresh and (browser) share.

**Target user mindset:** factory workers who distrust payroll and want to predict/verify their pay. The app's value is **accuracy + transparency**.

---

## 2. Tech stack & architecture (reference implementation)

- **Shell:** Apache **Cordova** (Android / iOS / browser) wrapping a web app; also runs as a standalone **PWA** (installable, service worker).
- **Language:** **Vanilla JavaScript** (no framework), plain **HTML**, plain **CSS** with CSS custom properties. State is module-level globals + `localStorage`.
- **No build step.** Files are loaded directly via `<script>` tags in dependency order.
- **Vendored libraries (local, for offline):**
  - `jsPDF` — paystub PDF generation.
  - `Motion` (motion.one) — spring/keyframe animations for sheets & charts.
  - `lz-string` — compress backup payloads for QR.
  - `qrcode-generator` — render backup QR.
  - `jsQR` — scan/restore backup QR via camera.
  - Charts are **custom inline SVG** (no chart library).
- **Cordova plugins:** device, statusbar, social sharing, local-notification, calendar.
- **Single-page app:** one `index.html`; all "screens" are **bottom sheets** over a home page. No router/URL routing.

You may rebuild in any stack (e.g., React/Svelte/Flutter), but preserve: offline-first local storage, the bottom-sheet navigation model, and the exact payroll/rotation math.

### File structure (reference)
```
www/
  index.html        Single page: home + all bottom sheets + script includes
  styles.css        All styling (CSS variables, dark/light themes)
  constants.js      Rotation pattern, time anchors, storage keys
  utils.js          Date/time helpers, safeParse, haptic
  state.js          Persistent state load + initDefaults() + tax tables
  rotation.js       Crew rotation + fatigue/lockout precompute
  payroll.js        Tax engine, premiums, holidays, vacation/lieu, PDF, pay sheet
  payrollTools.js   Cap tracker, verifier, history, T4 estimate, holiday explainer, bonus/VCP
  charts.js         Inline-SVG charts (rings, donut, bars, gauge, trend)
  calendar.js       Calendar rendering + analytics dashboard
  notifications.js  Shift reminders + calendar sync
  shiftForm.js      Shift logging sheet logic + rule validation
  ui.js             Bottom-sheet navigation stack, toasts, drag-to-dismiss
  settings.js       Settings sheet load/save
  theme.js          Theme apply (dark/light/system)
  yearSelector.js   Year dropdown
  dataExport.js     File backup export/import (shared build/apply helpers)
  backup.js         QR transfer/scan, backup reminders
  onboarding.js     First-run setup wizard
  coachmarks.js     First-run guided tour
  app.js            Boot/init, Cordova/back-button/history wiring
  sw.js             Service worker (precache + network-first)
  manifest.json     PWA manifest
```

---

## 3. Design system

**Aesthetic:** dark "industrial glassmorphism" — translucent cards, soft borders, blur, subtle glows. Orange accent. Tabular numerals for money. Haptic (10ms vibrate) on most taps. Spring animations on sheets/charts. Respect `prefers-reduced-motion`.

### Color tokens (CSS variables)

**Dark (default):**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#1A1820` | app background |
| `--text` | `#E9E4EF` | primary text |
| `--text-muted` | `#A89FB2` | secondary text |
| `--accent` | `#ff8a5c` | primary accent (orange) |
| `--day` | `#5cb8ff` | Day shift (blue) |
| `--night` | `#ff7a8a` | Night shift (red/pink) |
| `--off` | `#5fd6a6` | Off / positive (green) |
| `--border` | `#352F40` | borders |
| `--glass-border` | `rgba(255,255,255,0.07)` | translucent border |
| `--card` | `rgba(42,38,52,0.72)` | card surface |
| `--input-bg` | `#1F1B27` | inputs |

**Light** (via `[data-theme="light"]`): `--bg:#F3EFF7`, `--text:#2A2632`, `--accent:#ff7a45`, `--day:#2f8fe0`, `--night:#ef5366`, `--off:#2bb079`, etc.

**Semantic time-off colors:** Vacation cyan `#00bcd4`, Off red `var(--night)`, Lieu yellow `#fbbc04`, DropOff blue `var(--day)`, DropPaid green `var(--off)`.

**Easing presets:** `--spring: cubic-bezier(0.34,1.8,0.5,1)`, `--ease: cubic-bezier(0.4,0,0.2,1)`, `--sheet-ease: cubic-bezier(0.16,1,0.3,1)`.

### Core components
- **Bottom sheet** (`.bottom-sheet`): slides up from bottom; `.active` = visible (`bottom:0`), else off-screen (`bottom:-100%`). Backed by a dim `.modal-overlay` (z-index 99); sheets z-index 100+.
- **Cards** (`.sheet-card`, `.an-flat-card`): rounded (10–18px), glass border, soft shadow.
- **Toggle groups** (`.toggle-group` / `.toggle-btn`): pill buttons, single-select, `.active` highlights with accent; semantic color variants (`.day-type`, `.night-type`, `.crew-type`, `.role-btn`).
- **Switches** (`.switch`): iOS-style toggle; "on" track = green `--off`.
- **Buttons** (`.btn-action`): `.btn-save` (accent), `.btn-cancel` (muted), `.btn-remove` (red). Press = `scale(0.96)`.
- **Toasts** (`#toast-container`, top of screen): success/error, auto-dismiss ~3s; an undo variant.
- **Inputs:** `.text-input`, `.number-input`, `.time-input` (`<input type=time>`), date inputs.

---

## 4. Data model (localStorage)

All keys are JSON strings. Versioned suffix `V20` (bump suffix to wipe).

| Key | Variable | Shape |
|---|---|---|
| `kingDrewShiftsV20` | `extraShifts` | `{ "YYYY-MM-DD": ShiftObject }` — overrides on top of the base rotation |
| `kingDrewSettingsV20` | `sysSettings` | settings object (see §11) |
| `kingDrewRotationV20` | `savedRot` | `{ date: "YYYY-MM-DD", offset: number }` rotation anchor |
| `kingDrewSyncedEventsV20` | `syncedEvents` | `{ "YYYY-MM-DD": {title,start,end} }` mirror of device-calendar events |
| `kingDrewTaxTablesV20` | `taxTables` | fetched tax constants by year (overrides built-ins) |
| `kingDrewTaxFetchedV20` | — | ISO date string of last tax fetch |
| `kingDrewPaystubsV20` | — | `{ [ppIndex]: {gross,tax,cpp,ei,net,year,savedAt} }` real paystubs |
| `kingDrewExtraPayV20` | — | `[ {id,type,date,gross,net,tax,cpp,ei} ]` bonus/VCP payments |

Use a `safeParse(key, fallback)` that returns the fallback on missing/corrupt JSON.

### ShiftObject (every key `extraShifts[date]` can have)
```
type:        'Day'|'Night'|'DropPaid'|'DropOff'|'Vacation'|'Off'|'Lieu'  (the override kind)
role:        'Reg'|'TL'|'Manual'
startTime:   'HH:MM'        endTime: 'HH:MM'
otHours:     number   (1.5× hours)     dtHours: number (2.0× hours)
otReason:    string   (optional note)
regPay:      boolean  (off-day pickup paid at straight time, no OT/DT)
manualRate:  number   (only when role==='Manual')
vacHours:    number   (vacation hours when a shift is partially short)
crew:        'A'|'B'|'C'|'D'|'OT'|null  (per-day crew override)
shift2:      { startTime, endTime, otHours, dtHours }  (a second shift same day)
overrideLockout:  boolean  (bypass 120h limit)
overrideRule16h:  boolean  (bypass 16h/24h window)
overrideRest:     boolean  (bypass 8h rest minimum)
```
A "shift" in the calendar is the **base rotation shift** unless an `extraShifts[date]` overrides it.

---

## 5. Domain model: rotation, crews, pay periods

### The 28-day rotation pattern
```
PATTERN = [D,D,O,O,N,N,N,O,O,D,D,O,O,O,N,N,O,O,D,D,D,O,O,N,N,O,O,O]   // index 0..27
// D=Day, N=Night, O=Off
```

### Crews (A/B/C/D)
All four crews derive from the **same** anchor; they differ only by transform:
- **D** = `PATTERN[index]` (base).
- **C** = `PATTERN[index]` with **Day↔Night inverted** (Off stays Off).
- **B** = `PATTERN[(index + 21) % 28]`.
- **A** = `PATTERN[(index + 21) % 28]` **inverted**.

### Position in cycle
```
basePPStartUTC = Date.UTC(2025, 11, 19)   // Dec 19 2025 (pay-period anchor)
MS_DAY = 86_400_000;  MS_PP = 1_209_600_000 (14d);  MS_PP_TO_END = 1_123_200_000 (13d)

getPIndex(currUTC):
  ref = UTC midnight of savedRot.date
  return ((floor((currUTC - ref)/MS_DAY) + (savedRot.offset||0)) % 28 + 28) % 28

getShiftForCrew(pIndex, crew): apply the crew transform above → 'D'|'N'|'O'
```
`savedRot = { date, offset }` is a **shared plant anchor** (not per-crew). The user sets it once; onboarding can detect the **crew letter** by asking what they're working today and matching `getShiftForCrew`.

### Rotation anchor offset options (Settings)
A `selectRotOffset(n)` toggle with 4 presets, each = "what schedule does my anchor date land on":
- `0` → "2-Day Day", `4` → "3-Day Night", `14` → "2-Day Night", `18` → "3-Day Day".
The chosen `offset` shifts everyone within the 28-day cycle.

### Shift clock times
- **Day:** 06:30 → 18:30 (12h). **Night:** 18:30 → 06:30 next day (12h).
- "Logical today" for night workers: before **06:30** counts as the **previous** calendar day.
- Float-hour helpers: Day start 6.5 / end 18.5; Night start 18.5 / end 30.5 (next-day 06:30 expressed as 24+6.5).

### Pay periods
- 14-day periods anchored at `basePPStartUTC`. `ppIndex = floor((utc - basePPStartUTC)/MS_PP)`.
- PP start = `basePPStartUTC + ppIndex*MS_PP`; PP end = start + `MS_PP_TO_END` (13 days later).
- `getPayPeriodsInYear(year)` counts PPs whose **end date** lands in that year (≈26).
- "Drop period" flag: a PP is a drop-eligible period when `((ppIndex % 3)+3)%3 === 1`.

---

## 6. Fatigue & legal rest rules (precompute per year+crew)

`precalcFatigue(year, crew)` builds a per-day map `dayFatigue[date]` enforcing:

**(a) 120-hour / 14-day cap.** Walk each PP's 14 days accumulating expected hours; the first day that would push the running total **> 120.01h** (or once the total **≥120h**) becomes a **lockout** — subsequent days are locked (hours zeroed) unless a shift was already booked before the boundary, or `overrideLockout` is set. Off days in an already-full PP are also locked.

**(b) 16-hour / 24-hour window.** For each working day, the hours worked within a rolling 24h window (previous shift hours + overlap with current) must not exceed **16.01h**; otherwise the day is a `is16hLockout` unless `overrideRule16h`.

**(c) 8-hour rest.** When the 16h rule trips, if rest between shifts `< 8h` it's a `isRestLockout` unless `overrideRest`. General rest checks use **7.95h** (8h minus float slack) backward and forward.

`dayFatigue[date]` fields: `ppIndex, ppDayIndex, baseWorkHours, scheduledWorkHours, isLockout, is16hLockout, isRestLockout, isDropPeriod, isPPBoundary`.

These rules drive calendar lockout badges and block/warn on save in the shift form.

---

## 7. Payroll calculation engine (exact)

### 7.1 Tax constants by year (built-in; `taxTables` can override)
```
2024: fedBPA 15705, onBPA 12399, cea 1433, cppRate .0595, annCPPMax 3867.50, ympe 68500,
      cpp2Rate .04, annCPP2Max 188.00, yampe 73200, eiRate .0166, annEIMax 1049.12
2025: fedBPA 16129, onBPA 12747, cea 1471, cppRate .0595, annCPPMax 4034.10, ympe 71300,
      cpp2Rate .04, annCPP2Max 396.00, yampe 81200, eiRate .0164, annEIMax 1077.48
2026: fedBPA 16452, onBPA 12989, cea 1501, cppRate .0595, annCPPMax 4230.45, ympe 74600,
      cpp2Rate .04, annCPP2Max 416.00, yampe 85000, eiRate .0163, annEIMax 1123.07
```
`getTaxYear(year)` = fetched override ?? built-in ?? 2026 fallback. Tax tables may be refreshed from `TAX_TABLES_URL` (GitHub raw JSON) when online; failures fall back silently to built-ins.

### 7.2 `calculateTaxes(biGross, ppIndex, year)` → `{cpp, cpp2, ei, fedTax, onTax, total}`
All per **bi-weekly** pay period. `ppCount = getPayPeriodsInYear(year)`, `annG = biGross * ppCount`.

```
CPP1 (if ppIndex < cppMaxPP):  max(0, min(biGross, ympe/ppCount) - 3500/ppCount) * cppRate   else 0
CPP2 (if ppIndex < cpp2MaxPP and annG > ympe):
       max(0, min(biGross, yampe/ppCount) - ympe/ppCount) * cpp2Rate                          else 0
EI   (if ppIndex < eiMaxPP):   biGross * eiRate                                                else 0

annCPP  = min(cpp*ppCount, annCPPMax)
annCPP2 = min(cpp2*ppCount, annCPP2Max)
annEI   = min(ei*ppCount, annEIMax)

# Federal BPA phase-out above 181,440:
if annG > 181440: fedBPA -= (min(annG-181440, 258482-181440)/77042) * (fedBPA - 14829)

# Federal tax (annual, 2026 brackets):
annG<=58523:   annG*0.14
<=117045:      8193.22  + (annG-58523)*0.205
<=181440:      20190.23 + (annG-117045)*0.26
<=258482:      36932.93 + (annG-181440)*0.29
else:          59275.11 + (annG-258482)*0.33
fedCredits = (fedBPA + annCPP + annCPP2 + annEI + cea) * 0.14
fedT = max(0, fedGross - fedCredits)

# Ontario tax (annual):
annG<=53891:   annG*0.0505
<=107785:      2721.50  + (annG-53891)*0.0915
<=150000:      7652.80  + (annG-107785)*0.1116
<=220000:      12364.00 + (annG-150000)*0.1216
else:          20876.00 + (annG-220000)*0.1316
onCredits = (onBPA + annCPP + annCPP2 + annEI) * 0.0505
onT = max(0, onGross - onCredits)

# Ontario surtax:
if onT > 5818: onT += (onT-5818)*0.20
if onT > 7446: onT += (onT-7446)*0.36

# Ontario Health Premium (by annual income):
20000<annG<=36000: min(300, (annG-20000)*0.06)
<=48000:           min(450, 300+(annG-36000)*0.06)
<=72000:           min(600, 450+(annG-48000)*0.25)
<=200000:          min(750, 600+(annG-72000)*0.25)
else:              min(900, 750+(annG-200000)*0.25)
onT += OHP

return { cpp, cpp2, ei, fedTax: fedT/ppCount, onTax: onT/ppCount,
         total: cpp+cpp2+ei+fedT/ppCount+onT/ppCount }
```
`cppMaxPP/cpp2MaxPP/eiMaxPP` (default 9999) let the user say "I've maxed this deduction at PP N" so it stops being deducted after that PP.

### 7.3 Shift premiums — `calcPremiums(dateStr, startStr, hours, rate)`
Walk the shift in **30-minute buckets** from the start time; for each bucket add a premium based on **wall-clock hour** and **day of week**, then × 0.5h:
```
hour in [17..23]  → +$0.90/h  (afternoon)   [counts aftHrs]
hour in [0..6]    → +$0.95/h  (night)        [counts nightHrs]
Saturday (dow 6)  → +$1.00/h                 [counts satHrs]
Sunday   (dow 0)  → +(rate*0.10)/h           [counts sunHrs]   (Sunday premium is 10% of wage)
```
Returns `{total, aftHrs, nightHrs, satHrs, sunHrs}`. Premiums stack (e.g., Saturday night).

### 7.4 Statutory holidays — `getHolidays(year)` → `{ "YYYY-MM-DD": {n: name, m: multiplier} }`
Ontario stats (Good Friday via anonymous Gregorian Easter algorithm; floating Mondays via nth-weekday):
New Year's (1.5), Family Day 3rd Mon Feb (1.5), Good Friday (1.5), Victoria Day last Mon before May 25 (1.5), Canada Day Jul 1 (1.5), Civic 1st Mon Aug (1.5), Labour Day 1st Mon Sep (1.5), Thanksgiving 2nd Mon Oct (1.5), Christmas Eve Dec 24 (1.5), **Christmas Day Dec 25 (2.0)**, **Boxing Day Dec 26 (2.0)**.

**Holiday pay:** every stat holiday pays **8h at straight rate**. If worked, worked hours get an **extra** premium: `+0.5×` (m=1.5) or `+1.0×` (m=2.0) on top of regular. A **night shift the evening before** a holiday earns the premium on up to **10h**.

### 7.5 Per-pay-period gross (the canonical loop)
For each of the 14 days in a PP, for the crew: determine base shift, apply any `extraShifts` override, compute worked regular hours `dayR = min(actual, base)` and extra `dayE = max(0, actual-base)`. Then:
- regular pay `dayR*rate` + premiums (`calcPremiums`),
- extra hours split into OT (`*rate*1.5`) and DT (`*rate*2.0`) — default all-DT unless OT/DT specified, except `DropPaid` extra defaults to OT,
- vacation hours `vacHours*rate`,
- holiday 8h + worked premiums,
- second-shift hours + premiums,
- locked days contribute 0.

Rate: `regRate` (Reg), `tlRate` (TL), or `manualRate` (Manual). Net = `gross - calculateTaxes(gross, ppIndex, year).total`.

> This same per-PP gross loop appears in three places (pay sheet, analytics, pay-tools). Factor it into **one** function in a rebuild.

---

## 8. Vacation, Lieu, and Drop rules

**Vacation cycle** — `getVacationCycle(date)`: a yearly window from `vacationStartDate`→`vacationEndDate` (default Jan 1 → Dec 31), rolled to contain the target date. **Limit** = `vacationLimit` (default **150h**). `getUsedVacationHours(crew, date)` sums all `type==='Vacation'` entries (and any shift with `vacHours>0`) inside the current cycle. Partial vacation hours = `base - workedDuration`; full vacation = base (12h on a D/N day).

**Lieu (banked holiday) days** — `computeLieuBalance(date, crew)`: you **earn** a lieu day when a **stat holiday falls on your crew's OFF day**; it **expires 4 months** after it's earned (FIFO). You **consume** one by logging `type==='Lieu'`. Balance = count of unexpired earned minus taken. Saving a Lieu day is blocked when balance ≤ 0.

**Drop days:**
- **DropOff** = an **unpaid** dropped shift (full day off, 0h). Limited to **1 per ~6-week cycle**.
- **DropPaid** = a **paid** drop (default 12h, or custom times); extra hours default to OT. Also ~1 per cycle, and blocked if an unpaid absence exists in the cycle.

---

## 9. Screens & features (full behavior)

The home page shows: header (logo, "Welcome, {name}", ⚙️ settings), a top **pay-period summary** strip, the **calendar**, and the **analytics dashboard** (side + below). Everything else is a bottom sheet.

### 9.1 Calendar (`calendar.js`)
- **Three views:** Month, Week, Year (toggle). Each day cell colored by shift (Day blue / Night red / Off green), with badges: extra/OT hours, holiday, drop day, 120h-lockout ❌, modified (override) marker, "PP end" marker, "today" ring.
- **Tap a day** → opens the **shift-logging sheet** for that date. **Long-press** a day → a context menu (quick actions) — note: native long-press copy/paste menu is suppressed app-wide; this is the app's own menu.
- Year navigation via a year `<select>`; rendering bounded by `startYear`/`endYear` (default 2024–2036).

### 9.2 Shift logging sheet (`shiftForm.js`, `#sheet-pickup`)
Opened for a specific date. Sections:
- **Quick-log templates:** `+4h Early OT` (start 4h earlier → 16h), `+4h Late OT` (end 4h later → 16h), `12h Vacation`.
- **Role & pay:** Regular / Team Leader / Manual (Manual reveals a rate input).
- **Shift times:** start/end time pickers; "Clear"; "+1h OT (Meeting)" adds an hour to end + marks as OT.
- **Classify missed hours** (shown when logged `< base`): slider splits the shortfall between **Unpaid** and **Vacation**.
- **Classify extra hours** (shown when logged `> base`): slider splits the extra between **OT (1.5×)** and **DT (2.0×)**; optional **OT reason** text; an off-day "**Regular Pay**" toggle (pay extra at straight time, hide OT/DT).
- **Add More** (second shift): a `shift2` with its own times + OT/DT split.
- **Schedule overrides:** force Day / Night; per-day crew override (A/B/C/OT).
- **Time off & absences:** 🏖️ Vacation, 🚫 Unpaid Off, 🏛️ Lieu Day, 💧 Drop Off, 💰 Drop Paid (each color-coded with a glow).
- **Conflict warnings:** if a rule trips (120h, 16h/24h, 8h rest, vacation limit, lieu balance, drop cycle), show a red banner; for the override-able rules show an "Override Lockdown" checkbox.
- **Actions:** Clear Day, Cancel, Save. Save writes the `ShiftObject` to `extraShifts[date]`, recomputes fatigue, re-renders, reschedules notifications, and (if enabled) syncs the device calendar.

### 9.3 Pay dashboard (`payroll.js`, `#sheet-payroll`)
Opened from the **tappable top summary card** (opens the *displayed* pay period; in week view that's the viewed week). Shows for the chosen PP: date range + progress, **hours breakdown** (Regular, OT, DT, Vacation, Lieu, Holiday pay, Working-holiday premiums, banked lieu), **WORKED vs PAID** hours, **YTD worked hours**, **cycle absences** (vacation remaining, unpaid, drop days), **premium hours** (aft/night, sat/sun), **deductions** (Tax Fed+ON, CPP1/CPP2/EI), **Gross** and **Net Pay**.
- **"What-If" OT simulator:** two sliders (OT, DT hours) → live "+gross / − est. tax / + net bump" using marginal `calculateTaxes`.
- **Footer:** 🧰 Tools (hub), 📄 PDF (jsPDF paystub), 📤 Text (share summary), Close.

### 9.4 Analytics dashboard (`calendar.js` → `#analytics-side`, `#analytics-below`, `#pp-top-summary`)
- **Top summary (tappable):** PP progress (Day X of 14, days left), Gross / Net / PP Hours heroes, "Where your pay goes" stacked bar (Net/Fed/ON/CPP/EI), 120h fatigue bar, pay-period breakdown rows. Tapping it opens the pay dashboard for that PP.
- **Month vs previous month** paired bars (days worked, hours, OT/DT).
- **CPP & EI Caps** card: two rings (CPP combined, EI) vs annual max.
- **Pay Trend** chart: last ~8 PPs, switch Gross / Hours / OT-DT.
- **Year to Date:** YTD gross + projected annual (heroes).
- **Time Off** card: three **clickable rings** — Vacation (used/limit), Holiday (banked lieu), Drop (used) — each opens a **detail sheet** listing *when* (date + which shift it covered) the allowance was used.
- Manually-logged **bonus/VCP** payments are folded into YTD gross and the CPP/EI rings.

### 9.5 Pay Tools hub (`payrollTools.js`, `#sheet-paytools`)
A menu opening these tools:
1. **📊 Contribution Caps** — YTD **CPP / CPP2 / EI** progress bars toward each annual max, the projected **pay period each one stops**, and the resulting **per-cheque net bump** once maxed. Folds in bonus/VCP CPP/EI.
2. **🔍 Paystub Verifier** — enter your real paystub (gross, tax, CPP, EI, net); it diffs against the app's calc for the active PP and flags any line off by **>$5** (green ≤$1, amber ≤$5, red >$5) with a verdict. "💾 Save" stores it to history.
3. **🧾 Paystub History** — saved real paystubs by PP, a true **YTD-from-actuals**, and **average drift** vs the app per line.
4. **📄 T4 / Refund Estimate** — projects year-end **T4 boxes** (14 income, 22 tax, 16 CPP, 18 EI) and an estimated **refund or balance owing**. Uses saved paystubs when available, else the schedule model, **plus** the year's logged bonus/VCP (added unscaled). "Not tax advice."
5. **💵 Bonus & VCP Payments** — log one-off pay (annual **Bonus** in Feb, quarterly **VCP**) with gross/net/tax/CPP/EI + date; grouped by year with totals; deletable. Feeds the cap tracker, T4 estimate, and dashboard YTD.
6. **🎉 Holiday Pay Explainer** — per stat holiday for your crew: 8h base + worked premium math, with a yearly total.

### 9.6 Settings (`settings.js`, `#sheet-settings`)
Groups:
- **Data Management & Privacy:** Export Backup (.json), Import Backup, **Transfer via QR**, **Restore via QR (scan)**, **Backup Reminder** (Off/Weekly/2wk/Monthly), **Replay App Tour**.
- **Native OS Integrations:** Sync to Phone Calendar, Smart Wake-Up Alarms.
- **Profile & Work Defaults:** Theme (System/Dark/Light), Display Name, Default Crew (A–D), Default Role (Reg/TL).
- **Shift Notifications:** 24h / 12h / 3h warnings.
- **Financial & Tax Overrides:** Regular rate, TL rate, Stop CPP1/CPP2/EI deductions at PP (dropdowns of PP end dates), "Update tax rates now" + last-synced date.
- **Vacation Management:** Cycle limit (hours), cycle start/end dates.
- **Calendar & Rotation Anchor:** render start/end year, base rotation date + the 4 offset presets.
Save writes `sysSettings` (and `savedRot`) to localStorage and re-renders.

---

## 10. First-run experiences

### 10.1 Onboarding wizard (`onboarding.js`) — shown once (`hasSeenOnboarding`)
Full-screen overlay (its own stack, not a bottom sheet). Steps: **Welcome → Name → Role & pay rate → Find your crew → Live preview → Notifications → Theme → Calendar sync → Success**.
- **Find your crew** is the standout: either pick A–D directly, or answer "what are you working today?" (Day/Night/Off) and the app resolves the matching crew via `getShiftForCrew`. If a single day is ambiguous (crews share off-days), it shows the candidate crews as **tappable 14-day mini-calendars** so the user picks the schedule that matches reality. It only sets the crew letter — never the shared rotation anchor.
- **Live preview:** a 14-day color grid of the chosen crew's pattern.
- **Success:** "You're set, {name}. Your next shift is {Day/Night}, {weekday date}."
- Skippable (keeps defaults) and resumable (persists current step). On finish, rolls into the coachmark tour.

### 10.2 Guided coachmark tour (`coachmarks.js`) — shown once (`hasSeenCoachmarks`), replayable from Settings
A one-time **spotlight tour** on the home screen: dims the screen, cuts a rounded "hole" (box-shadow technique) around a target element, shows a caption with Back / Skip / Next + progress. **5 steps:** pay-period card → calendar (tap a day; OT vs DT) → CPP & EI caps → Time Off rings → Settings gear. Auto-starts after onboarding (new users) or on next launch (existing users on update); deferred while onboarding or any sheet is open; skips any missing target; repositions on resize.

---

## 11. Settings object & defaults (`initDefaults`)
```
theme 'system' | displayName 'Drizzy' | regRate 47.06 | tlRate 50.11 | defaultRole 'Reg'
vacationLimit 150 | defaultCrew 'D' | cppMaxPP 9999 | cpp2MaxPP 9999 | eiMaxPP 9999
startYear 2024 | endYear 2036 | vacationStartDate '2026-01-01' | vacationEndDate '2027-01-15'
notif24h true | notif12h true | notif3h true | syncCalendar false | smartAlarms false
hasSeenOnboarding false | hasSeenCoachmarks false | backupReminderDays 0
```
(Defaults exist only so the app runs before onboarding; onboarding overwrites the personal ones.)

---

## 12. Navigation (bottom-sheet back-stack) — `ui.js`

Sheets form a **back-stack**, not independent modals:
- `openSheet(id)`: push onto `_sheetStack`, give the sheet an **incrementing z-index** (`100 + depth`) so a child always paints above its parent (parent stays visible underneath), show the dim overlay, `pushState`.
- **Back** (Close/Cancel buttons, overlay tap, swipe-down, hardware back) → `history.back()` → `popstate` → `_popSheet()` which slides the top sheet down and **reveals the parent**; only when the last sheet closes do we return home and hide the overlay.
- `closeAllSheets()` tears the whole stack down (used after save/restore) via `history.go(-depth)`.
- **Swipe-to-dismiss:** drag a sheet down past ~80px (or fast flick) to go back a level; otherwise it springs back. Overlay dims proportionally during drag.
- Android hardware back and browser history are kept in sync through `history.pushState`/`popstate`.

Also: a global handler **suppresses the native long-press / copy-paste menu** everywhere except real inputs (CSS `user-select:none` on body, `text` on inputs; `contextmenu` preventDefault outside editable fields).

---

## 13. Notifications & calendar sync (`notifications.js`)

For each working day, schedule up to 4 local notifications (IDs derived from `YYMMDD` + a digit), respecting the toggles:
| Flag | Lead | ID suffix | Title / text |
|---|---|---|---|
| `notif24h` | start − 24h | `1` | "Upcoming Shift in 24h" — "...starting tomorrow at {time}." |
| `notif12h` | start − 12h | `2` | "Upcoming Shift in 12h" — "...starting today at {time}." |
| `notif3h` | start − 3h | `3` | "Shift Starts Soon" — "...starts in 3 hours ({time})." |
| `smartAlarms` | start − 2h | `4` | "⏰ WAKE UP — {shift}" — "Your shift starts in 2 hours!" (high priority, sound, wakeup) |

Cancel by explicit ID list before rescheduling (Android stale-storage workaround). **Calendar sync** (when `syncCalendar` + plugin present): mirror each updated day into a "Plant" calendar — "DAY/NIGHT SHIFT" timed events (06:30 / 18:30 default) or an all-day "OFF SHIFT", with crew suffixes like "(A-SHIFT)"/"(OT)"; delete the previous event for that date first; track in `syncedEvents`.

---

## 14. Backup, export & QR transfer (`dataExport.js`, `backup.js`)

- **File export:** serialize all stores (`shifts, settings, rotation, synced, taxTables, taxFetched, paystubs, extraPay`) to `ShiftHub_Backup_YYMMDD.json`; share via Web Share / Cordova social sharing / clipboard fallback. **Import:** parse and restore via a shared `applyBackupObject()` that rewrites localStorage, reloads in-memory state, re-applies theme/greeting/crew, re-renders, and **guards a missing rotation** (falls back to a valid default so rendering can't break).
- **QR transfer:** compress the backup JSON with lz-string → `SHB1:<base64>` → render a QR (`qrcode-generator`). Too big for one QR → tell the user to use file export.
- **QR restore:** camera scanner (`jsQR`) decodes → decompress → `applyBackupObject`. Camera released on sheet close.
- **Backup reminder:** opt-in cadence (7/14/30 days); on launch, nudge once/day when overdue (tracks `lastBackupAt`, `lastBackupNudge`).

---

## 15. PWA / offline (`sw.js`, `manifest.json`)

- **Service worker:** precache the app shell (all JS/CSS/HTML + vendored libs + icon), bump `CACHE_NAME` to invalidate. **Fetch strategy = network-first, cache fallback**, scoped to **same-origin GET** only (cross-origin calls like the tax-table API are left to the caller's own try/catch so they don't surface as SW errors).
- Startup tax-table refresh is skipped when `navigator.onLine === false`.
- Manifest: installable, dark theme color, icon.

---

## 16. Boot sequence (`app.js`)
1. Load + `safeParse` all stores; `initDefaults()`.
2. `applyTheme(sysSettings.theme)`; subscribe to OS color-scheme changes (for "system").
3. Set greeting; populate year selector; if online, refresh tax rates.
4. Set crew selector to `defaultCrew`; `renderCalendar()` (which renders analytics).
5. `maybeStartOnboarding()` (first run) → on finish, `maybeStartCoachmarks()`.
6. For returning users, `maybeBackupReminder()` and (deferred) `maybeStartCoachmarks()`.
7. Wire Cordova `deviceready` (notification permissions), `backbutton` (one level back), and `popstate` (drive the sheet stack); register the service worker.

---

## 17. Critical rules summary (don't get these wrong)

| Rule | Threshold / value |
|---|---|
| Rotation pattern | the exact 28-entry `PATTERN`; crews via invert/+21 transforms |
| Pay-period anchor | `Date.UTC(2025,11,19)`, 14-day periods |
| CPP1 | 5.95% of (gross − $3,500/pp exemption) up to YMPE/pp; capped at annual max |
| CPP2 | 4% between YMPE and YAMPE; only when annual gross > YMPE |
| EI | rate × gross, capped at annual max |
| Premiums | Aft +$0.90, Night +$0.95, Sat +$1.00, Sun +10% of rate; 30-min buckets; stack |
| Holiday | 8h straight + worked premium (+0.5× or +1.0×); night-before up to 10h |
| OT / DT | 1.5× / 2.0×; extra defaults to DT (DropPaid extra → OT) |
| 120h cap | >120.01h per 14-day PP → lockout (overridable) |
| 16h window | >16.01h in 24h → lockout (overridable) |
| Rest | <8h between shifts when 16h trips; general 7.95h (overridable) |
| Vacation | limit 150h per cycle; blocks at limit |
| Lieu | earn on stat-holiday-on-off-day; expire 4 months; consume by logging Lieu |
| DropOff/DropPaid | ~1 per ~6-week cycle; DropPaid blocked if unpaid absence in cycle |
| Verifier tolerance | match ≤$1, minor ≤$5, flag >$5 |

---

## 18. Suggested build order
1. Storage + state + `initDefaults` + settings.
2. Rotation (`PATTERN`, crews, `getPIndex`, pay periods) + calendar render.
3. Fatigue precompute (120h/16h/8h).
4. Tax engine (`calculateTaxes`) + premiums + holidays + per-PP gross (one shared function).
5. Shift-logging sheet + rule validation.
6. Pay dashboard + PDF + analytics dashboard + charts.
7. Bottom-sheet back-stack navigation + toasts.
8. Pay Tools (caps, verifier, history, T4, bonus/VCP, holiday explainer).
9. Onboarding wizard (incl. find-my-crew) + coachmark tour.
10. Notifications + calendar sync.
11. Backup (file + QR) + reminders.
12. PWA service worker + offline + theming polish.

Build a small **automated test harness** that drives the UI headlessly and asserts: payroll numbers against known values, sheet back-navigation, onboarding/coachmark flows, and backup round-trips. Treat the payroll math as the thing that must never silently break.
