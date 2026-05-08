---
name: STLA Shift Hub
description: >
  Industrial-dark, glassmorphism mobile PWA for factory shift workers.
  Material You surface hierarchy meets Apple-calendar precision — a tool
  that feels at home on a Samsung Galaxy Fold as much as a standard phone.

colors:
  # ── Core surface stack (dark mode, default) ──────────────────────────
  background:           "#141218"
  surface:              "rgba(28, 26, 36, 0.70)"
  surfaceLow:           "#1E1C24"
  surfaceContainer:     "#221F27"
  surfaceHigh:          "#2B2930"
  surfaceHighest:       "#36343B"
  outlineVariant:       "#49454F"

  # ── Text ─────────────────────────────────────────────────────────────
  textPrimary:          "#E6E1E8"
  textMuted:            "#938F99"

  # ── Brand ────────────────────────────────────────────────────────────
  accent:               "#FF6B35"
  accentLight:          "#FF9A6C"

  # ── Shift semantics ──────────────────────────────────────────────────
  shiftDay:             "#38BDF8"
  shiftNight:           "#F43F5E"
  shiftOff:             "#34D399"
  shiftModified:        "#A78BFA"
  shiftVacation:        "#00BCD4"
  dropBadge:            "#FBBF24"

  # ── Calendar-specific ─────────────────────────────────────────────────
  calTodayAccent:       "#7C3AED"
  calCellBg:            "#1A1820"
  calCellBgToday:       "#201E30"
  calCellBorder:        "#2B2830"
  calHeaderBg:          "#1E1C24"
  calTabActiveBg:       "#E6E1E8"
  calTabActiveText:     "#141218"
  calTabInactiveText:   "#938F99"

  # ── Pay-period cycle (4-slot rotating tints) ──────────────────────────
  ppAmber:              "rgba(251, 191, 36, 0.18)"
  ppTeal:               "rgba(20, 184, 166, 0.16)"
  ppViolet:             "rgba(139, 92, 246, 0.18)"
  ppRose:               "rgba(244, 114, 182, 0.15)"

  # ── Glassmorphism primitives ──────────────────────────────────────────
  glassBg:              "rgba(18, 16, 24, 0.84)"
  glassBorder:          "rgba(255, 255, 255, 0.08)"
  border:               "#2B2830"

  # ── Light mode overrides ──────────────────────────────────────────────
  light:
    background:         "#E8E4EE"
    surface:            "rgba(255, 255, 255, 0.72)"
    textPrimary:        "#1C1B1F"
    textMuted:          "#6B6570"
    accent:             "#FF6D00"
    shiftDay:           "#007AFF"
    shiftNight:         "#FF3B30"
    shiftOff:           "#1A9E50"
    shiftModified:      "#AF52DE"
    border:             "#D5D0DC"
    glassBg:            "rgba(248, 244, 255, 0.84)"
    glassBorder:        "rgba(0, 0, 0, 0.07)"

typography:
  base:
    fontFamily: >
      -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI",
      Roboto, "Helvetica Neue", Arial, sans-serif
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "1.4"

  appTitle:
    fontSize: "24px"
    fontWeight: "900"
    letterSpacing: "-0.5px"

  appSubtitle:
    fontSize: "12px"
    fontWeight: "600"
    letterSpacing: "0.5px"
    textTransform: "uppercase"

  widgetTitle:
    fontSize: "20px"
    fontWeight: "900"
    lineHeight: "1.2"

  widgetOverline:
    fontSize: "10px"
    fontWeight: "600"
    letterSpacing: "0.18em"
    textTransform: "uppercase"

  sectionLabel:
    fontSize: "11px"
    fontWeight: "800"
    letterSpacing: "0.12em"
    textTransform: "uppercase"

  heroValue:
    fontSize: "24px"
    fontWeight: "900"
    letterSpacing: "-0.5px"
    lineHeight: "1"

  shiftCounter:
    fontSize: "26px"
    fontWeight: "900"
    lineHeight: "1"

  calMonthLabel:
    fontSize: "15px"
    fontWeight: "900"
    letterSpacing: "-0.3px"

  calMiniMonthTitle:
    fontSize: "13px"
    fontWeight: "800"
    letterSpacing: "0.3px"
    textTransform: "uppercase"

  calDayNumber:
    fontSize: "13px"
    fontWeight: "700"

  calDOWHeader:
    fontSize: "10px"
    fontWeight: "700"
    letterSpacing: "0.5px"
    textTransform: "uppercase"

  calCellType:
    fontSize: "10px"
    fontWeight: "700"

  calCellTime:
    fontSize: "9px"
    fontWeight: "600"

  badge:
    fontSize: "7px"
    fontWeight: "800"
    letterSpacing: "0.5px"

  settingsLabel:
    fontSize: "14px"
    fontWeight: "500"

  legend:
    fontSize: "11px"
    fontWeight: "600"
    letterSpacing: "0.5px"
    textTransform: "uppercase"

rounded:
  none:         "0"
  xs:           "4px"
  sm:           "6px"
  md:           "10px"
  lg:           "12px"
  xl:           "14px"
  "2xl":        "16px"
  "3xl":        "20px"
  "4xl":        "24px"
  "5xl":        "28px"
  full:         "50px"
  circle:       "50%"

spacing:
  "0":   "0"
  "1":   "2px"
  "2":   "4px"
  "3":   "6px"
  "4":   "8px"
  "5":   "10px"
  "6":   "12px"
  "7":   "14px"
  "8":   "16px"
  "9":   "18px"
  "10":  "20px"
  "12":  "24px"
  "14":  "28px"
  "16":  "32px"

elevation:
  # All surfaces use backdrop-filter blur + translucent fill + inset highlight
  surface0:
    background:       "var(--background)"
    backdropFilter:   "none"
    shadow:           "none"

  surface1:
    # Cards, calendar widget
    background:       "rgba(28, 26, 36, 0.70)"
    backdropFilter:   "blur(16px) saturate(160%)"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 4px 20px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.08) inset"

  surface2:
    # Dashboard cards, calendar redesign wrapper
    background:       "rgba(28, 26, 36, 0.70)"
    backdropFilter:   "blur(16px) saturate(160%)"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 8px 32px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset"

  surface3:
    # App header (nav bar), pill bar, button rows
    background:       "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(20px) saturate(180%)"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.16)"

  surface4:
    # Bottom sheets (maximum blur, modal)
    background:       "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(28px) saturate(180%)"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 -8px 40px rgba(0,0,0,0.32)"

motion:
  fast:       "0.15s ease"
  default:    "0.2s ease"
  themeSwap:  "0.3s ease"
  collapse:   "0.35s cubic-bezier(0.4, 0, 0.2, 1)"
  sheetOpen:  "0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)"
  toastPop:   "0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
  pressScale: "scale(0.96)"
  cardPress:  "scale(0.97)"

components:
  appHeader:
    backgroundColor:  "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(20px) saturate(180%)"
    padding:          "30px 20px 20px 20px"
    borderBottom:     "1px solid rgba(255, 255, 255, 0.08)"

  dashboardCard:
    backgroundColor:  "rgba(28, 26, 36, 0.70)"
    backdropFilter:   "blur(16px) saturate(160%)"
    borderRadius:     "28px"
    padding:          "20px"
    margin:           "20px"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 8px 32px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset"
    pressScale:       "0.97"

  calendarCard:
    backgroundColor:  "rgba(28, 26, 36, 0.70)"
    backdropFilter:   "blur(16px) saturate(160%)"
    borderRadius:     "28px"
    margin:           "0 6px 20px 6px"
    border:           "1px solid rgba(255, 255, 255, 0.08)"
    shadow:           "0 8px 32px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset"
    overflow:         "hidden"

  calendarCell:
    backgroundColor:  "#1A1820"
    borderRadius:     "12px"
    border:           "1px solid #2B2830"
    minHeight:        "82px"
    padding:          "7px 4px"
    pressOpacity:     "0.7"

  calendarCellToday:
    backgroundColor:  "#201E30"
    border:           "2px solid #7C3AED"

  pillBar:
    backgroundColor:  "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(12px)"
    borderRadius:     "50px"
    padding:          "5px"
    border:           "1px solid #2B2830"
    shadow:           "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.16)"
    position:         "fixed bottom 20px"

  pillBtnPrimary:
    backgroundColor:  "#FF6B35"
    textColor:        "#FFFFFF"
    borderRadius:     "50px"
    padding:          "8px 20px"
    fontSize:         "12px"
    fontWeight:       "800"
    shadow:           "0 3px 12px rgba(255, 107, 53, 0.35)"

  pillBtnSecondary:
    backgroundColor:  "#2B2930"
    textColor:        "#E6E1E8"
    borderRadius:     "50px"
    padding:          "8px 16px"
    fontSize:         "12px"
    fontWeight:       "700"
    border:           "1px solid #2B2830"

  bottomSheet:
    backgroundColor:  "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(28px) saturate(180%)"
    borderRadius:     "24px 24px 0 0"
    shadow:           "0 -8px 40px rgba(0,0,0,0.32)"
    openEasing:       "cubic-bezier(0.175, 0.885, 0.32, 1.1)"

  analyticsHeroCard:
    backgroundColor:  "rgba(28, 26, 36, 0.70)"
    borderRadius:     "24px"
    padding:          "16px 14px"
    shadow:           "0 2px 12px rgba(0,0,0,0.14)"
    accentTopBorder:  "3px solid var(--hero-color)"

  shiftTypeCard:
    backgroundColor:  "rgba(28, 26, 36, 0.70)"
    borderRadius:     "20px"
    padding:          "14px 8px"
    accentTopBorder:  "3px solid var(--shift-color)"

  toggleSwitch:
    width:            "46px"
    height:           "26px"
    borderRadius:     "26px"
    trackOff:         "#2B2830"
    trackOn:          "#34D399"
    thumbColor:       "#FFFFFF"

  toast:
    backgroundColor:  "rgba(18, 16, 24, 0.84)"
    backdropFilter:   "blur(20px) saturate(180%)"
    borderRadius:     "20px"
    padding:          "12px 20px"
    shadow:           "0 8px 32px rgba(0,0,0,0.36)"
    successAccent:    "4px left border in #34D399"
    errorAccent:      "4px left border in #F43F5E"

breakpoints:
  compact:    "max-width: 420px"
  default:    "420px – 767px"
  expanded:   "min-width: 768px"
---

## Overview

STLA Shift Hub is a personal shift-tracking PWA built for automotive factory workers on rotating crew schedules. The aesthetic is **dark industrial glassmorphism** — a near-black Material You surface hierarchy saturated in frosted glass, lit from within by four vivid shift-type colours and a dominant burnt-orange accent.

The product has two visual registers that must coexist: the **utility layer** (shift data, hours, pay) which demands instant readability at a glance, and the **ambient layer** (glassmorphic cards, blurred overlays) which makes a dense scheduling tool feel premium rather than clinical. Weight and contrast always serve legibility first; blur and translucency are atmosphere, not decoration.

The design is adaptive across three classes of device:
- **Compact** (< 420 px) — cover screen of a Galaxy Fold, narrow phones
- **Default** (420 – 767 px) — standard phone, main use case
- **Expanded** (≥ 768 px) — unfolded inner display or tablet; calendar and analytics sit side-by-side

---

## Colors

### Surface stack

The background is `#141218` — a near-black with a cool purple undertone inherited from Material You's neutral-variant tonal palette. Cards and modals layer over this as translucent frosted panes: `rgba(28, 26, 36, 0.70)` for cards, `rgba(18, 16, 24, 0.84)` for navigation chrome and sheets. The key rule is that **no surface is fully opaque** — every layer floats visually by being semi-transparent with a blur.

A secondary hierarchy of four M3 surface-container steps (`#1E1C24` → `#221F27` → `#2B2930` → `#36343B`) creates depth for interactive states (hover, press) without introducing new hues.

### Shift semantics — the dominant colour language

Four colours do the most communicative work in the app. They are carried consistently through cell backgrounds, border tints, pill badges, legend dots, analytics cards, and mini-month dots. They must never be swapped or reused for non-shift meanings:

| Role | Dark | Light | Meaning |
|---|---|---|---|
| **Day shift** | `#38BDF8` sky-blue | `#007AFF` iOS blue | Daytime working shift |
| **Night shift** | `#F43F5E` rose-red | `#FF3B30` iOS red | Overnight working shift |
| **Off** | `#34D399` emerald | `#1A9E50` forest green | Scheduled off day |
| **Modified** | `#A78BFA` violet | `#AF52DE` purple | Shift trade / modification |
| **Vacation** | `#00BCD4` cyan | — | Vacation block |
| **Drop day** | `#FBBF24` amber | `#FFCC00` | Drop-cycle indicator |

Each shift colour always appears as an 18–22 % opacity background tint on the cell, with a 35–45 % opacity border. The full-saturation colour is reserved for text labels, pill chips, and analytics numerals — never used as a solid fill on large surfaces.

### Pay-period cycle palette

The calendar uses a 4-slot rotating colour system to show which 14-day pay period each date belongs to. These are deliberately gentle (15–18 % opacity) so they don't compete with shift-type colours:

- PP-0 → amber tint `rgba(251, 191, 36, 0.18)`
- PP-1 → teal tint `rgba(20, 184, 166, 0.16)`
- PP-2 → violet tint `rgba(139, 92, 246, 0.18)`
- PP-3 → rose tint `rgba(244, 114, 182, 0.15)`

### Accent

The primary brand accent is `#FF6B35` — a saturated burnt orange. It appears on the app title wordmark (`STLA` is charcoal, `Shift Hub` is accent), the crew selector button, the pay-period progress bar glow, the "save" action button, and the hover ring on agenda items. Its 35 % opacity shadow (`rgba(255, 107, 53, 0.35)`) gives accent buttons their characteristic warm glow.

### Today accent

The current day uses **violet `#7C3AED`** rather than the shift-type colour, so it stands apart from the shift semantic palette. It fills the date circle with white text in both month and week views, and forms the active-tab highlight in the calendar's week-view card.

---

## Typography

The typeface is the system sans-serif stack: `-apple-system / "Segoe UI" / Roboto`. On iOS (the primary target) this renders as SF Pro; on Android as Roboto. **No web font is loaded** — this keeps the app fast on spotty factory Wi-Fi and ensures text renders with OS-level subpixel hinting.

### Scale and weight philosophy

The type scale skews heavy. Body-level text uses `weight: 500–600`; labels and section titles use `800`; hero numerals and the app title use `900`. This exaggerated weight compensates for the low contrast imposed by translucent surfaces and ensures numbers are readable at arm's length or in bright sunlight.

Key scale points:

| Role | Size | Weight | Notes |
|---|---|---|---|
| App title | 24 px | 900 | Letter-spacing −0.5 px; accent colour on subtitle word |
| App subtitle (greeting) | 12 px | 600 | 0.5 px tracking, all-caps |
| Widget / sheet date | 20–21 px | 900 | Primary contextual title |
| Hero analytics value | 24 px | 900 | −0.5 px tracking |
| Shift counter (analytics) | 26 px | 900 | Coloured by shift type |
| Calendar month label | 15 px | 900 | −0.3 px tracking |
| Dashboard card title | 16 px | 700 | |
| Section overline | 11 px | 800 | 0.12 em tracking, all-caps |
| Settings label | 14 px | 500 | Only body-weight occurrence |
| Calendar cell type | 10 px | 700 | Shift abbreviation (DAY / NIGHT) |
| Calendar cell date | 13 px | 700 | Inside 26 px circle |
| DOW headers | 10 px | 700 | 0.5 px tracking, all-caps |
| Mini-month title | 13 px | 800 | 0.3 px tracking, all-caps |
| Badge / OT chip | 7–9 px | 800 | Extreme weight at tiny size |
| Legend items | 11 px | 600 | 0.5 px tracking, all-caps |

**Overlines and section headers** universally use `text-transform: uppercase` with `letter-spacing: 0.08–0.18 em`. This creates strong visual anchors without requiring a separate display face.

---

## Layout & Spacing

### Grid

The layout uses an **8 px base unit**. Major rhythm points are 8, 12, 16, 20, 24, 28 px. The 20 px outer margin is used for most top-level card placement; the calendar strips this to 6 px so the glassmorphic card fills the full width with only a hint of breathing room.

### Responsive layout

**Default (phone):** Content stacks vertically. The calendar card leads, followed by analytics below.

**Expanded (≥ 768 px, foldable inner display / tablet):** A horizontal flex row — `cal-analytics-row` — splits the viewport 50/50: calendar on the left, analytics panel on the right. The two panels use `flex: 1 1 0; min-width: 0` so neither can overflow its half.

### Calendar grid internals

The month grid is `repeat(7, minmax(0, 1fr))` with `gap: 3px`. Using `minmax(0, 1fr)` (not bare `1fr`) is load-bearing — it allows cells to shrink below their min-content width without overflowing the card's `overflow: hidden` boundary.

The week view forces `minmax(110px, 1fr)` with `min-width: 770 px` to create a horizontal scroll context — the DOW header row and card grid are paired inside `.cal-scroll-area` so they scroll together.

The year view uses `repeat(3, minmax(0, 1fr))` on expanded displays and `repeat(2, 1fr)` on compact. Columns must use `minmax(0, 1fr)`, never bare `1fr`, for the same reason as month cells.

### Pill bar

The floating navigation is `position: fixed; bottom: 20 px; left: 50%; transform: translateX(-50%)` — centred in the viewport, not edge-anchored. It uses `width: fit-content` so it always hugs its content. On expanded displays it lifts to `bottom: 24 px`.

---

## Elevation & Depth

The elevation model is pure glassmorphism: **every layer above the base surface adds blur and reduces opacity**, rather than adding a darker shadow. The hierarchy has four levels:

| Level | Where | Blur | Background | Shadow |
|---|---|---|---|---|
| 0 | App background | — | `#141218` solid | none |
| 1 | Calendar widget, sheet cards | `blur(16px) sat(160%)` | `rgba(28,26,36,0.70)` | `0 4px 20px rgba(0,0,0,0.18)` + 1 px inset white highlight |
| 2 | Dashboard cards, calendar card | `blur(16px) sat(160%)` | `rgba(28,26,36,0.70)` | `0 8px 32px rgba(0,0,0,0.22)` + 1 px inset white highlight |
| 3 | App header, pill bar, btn-row | `blur(20px) sat(180%)` | `rgba(18,16,24,0.84)` | `0 8px 32px rgba(0,0,0,0.32)` |
| 4 | Bottom sheets, toasts | `blur(28px) sat(180%)` | `rgba(18,16,24,0.84)` | `0 -8px 40px rgba(0,0,0,0.32)` |

The **inset 1 px white highlight** (`0 1px 0 rgba(255,255,255,0.08) inset`) is used on Level 1 and 2 cards. It catches the implied light source from above, making cards read as physical panes of glass.

Analytics hero cards add a **3 px coloured top border** (`border-top: 3px solid var(--hero-color)`) to restore semantic colour within the neutral glass surface — the only place a full-saturation accent appears as a fill on a card edge.

---

## Shapes

Corner radius communicates hierarchy and interactivity:

| Radius | Usage |
|---|---|
| 50 px (pill) | Pill bar, all action buttons, crew selector, toggle-group buttons, btn-row |
| 28 px | Dashboard card, calendar card wrapper |
| 24 px | Bottom sheet (top corners only), analytics hero/flat cards |
| 20 px | Agenda items, shift-type analytics cards |
| 16 px | Week-number chip, crew chip, sheet sub-cards |
| 14 px | App logo |
| 12 px | Calendar cells, week cards, mini-month cards, settings groups |
| 10 px | Form inputs, toggle buttons |
| 8 px | Nav buttons (hover state) |
| 4–6 px | OT chips, inline badges |
| 50 % | Date-number today circle, legend dots, week-row today indicator |

The **28 px card radius** paired with `overflow: hidden` means all child content (header backgrounds, badge strips) is clipped to the card's curves without needing its own matching radius.

Bottom sheets use `24px 24px 0 0` — top corners rounded, bottom flush to the screen edge. This is the only place asymmetric radii appear.

---

## Components

### Calendar card (3 views)

The calendar is the centrepiece of the UI. It renders in three modes toggled by a segmented pill at the top-right of the header:

**Month view** — Standard 7-column grid. Each cell carries: date number circle (today gets violet fill), shift-type label, time range, holiday badge, drop-cycle badge, pay-period footer strip, and OT chip. Past cells are `opacity: 0.42; filter: grayscale(40%)`. The panel is collapsible by tapping the month label; a chevron icon rotates 90° to signal state.

**Week view** — Horizontally scrollable. Cards are `minmax(110px, 1fr)` so each day has a readable column. Today gets a 3 px violet left border. The DOW header and card grid share a scroll container so they stay aligned.

**Year view** — 12 mini-month grids. Each mini-month shows DOW initials, day numbers, and coloured dots for shift type. Tapping navigates to that month. On expanded displays, 3 columns; on compact, 2 columns.

### Shift semantic badges

Inline badges appear inside calendar cells and sheet detail views. They follow a strict scale: `7 px / weight 800` for the smallest (OT chips, drop badges), `8–9 px` for cell flags, `11–13 px` for sheet pills. All use the shift colour as background at 18–22 % opacity with white text — **never coloured text on a coloured background**.

The drop-day badge is the exception: yellow `#FBBF24` background with black text, rotated −10°, positioned absolutely above the cell's top-left corner. It intentionally breaks the glass aesthetic to demand attention.

### Pill bar (bottom navigation)

The floating pill bar holds 2–5 items depending on context. Secondary tabs use the M3 surface-high fill; the primary action (e.g., "Today") uses the full accent orange. The bar avoids the bottom safe-area inset by sitting at `bottom: 20 px` with no margin — it relies on `padding-bottom: 100 px` on `body` to prevent it overlapping scrollable content.

### Bottom sheets

Sheets animate in from off-screen bottom using a spring curve (`cubic-bezier(0.175, 0.885, 0.32, 1.1)`). The toast uses a stronger bounce (`1.275` overshoot) for a more playful, confirming feel. Sheets layer at `z-index: 100` over a `rgba(0,0,0,0.5)` modal overlay at z-index 99.

### Analytics dashboard

On expanded viewports the analytics panel is a sticky column beside the calendar. It uses the same glass card language but is architecturally distinct: no `overflow: hidden` on the outer wrapper so that sticky positioning within sub-sections can work.

Hero metric cards (`GROSS`, `NET PAY`) use a 3 px coloured top border to tag semantic meaning without using a coloured background. Shift counters (Days / Nights / Off) use the shift colour on the large numeral only.

The progress bar (`height: 6px; border-radius: 3px`) tracks pay-period completion. Fill colour is the accent orange; track is the border colour.

---

## Do's and Don'ts

**Do** use `minmax(0, 1fr)` for all CSS Grid column tracks inside a card with `overflow: hidden`. Using bare `1fr` (which resolves to `minmax(auto, 1fr)`) allows tracks to expand to their min-content width and overflow the clip boundary.

**Do** apply shift colours (`#38BDF8`, `#F43F5E`, `#34D399`, `#A78BFA`) at 15–22 % opacity for backgrounds and at full saturation for text labels and counters only.

**Do** keep the today indicator violet (`#7C3AED`) distinct from all shift-type colours. Today is a temporal landmark, not a shift type.

**Don't** use `opacity: hidden` or `overflow: hidden` on the calendar card itself to clip glassmorphism — the `border-radius: 28px` + `overflow: hidden` on `.cal-redesign` performs that role. Child elements that need to bleed to the card edge (header bar, crew bar, badge strips) rely on this.

**Don't** add `backdrop-filter` to elements that are already inside a `backdrop-filter` ancestor unless they are in a new stacking context — nested blurs degrade performance on mid-range Android without adding visible depth.

**Don't** use text weights below 600 in calendar cells or badge labels. At 7–10 px, weights 400–500 become illegible on AMOLED displays at high brightness.

**Don't** change the pay-period tint rotation order (amber → teal → violet → rose). Users build a spatial memory of which colour band belongs to which fortnight; reordering breaks that orientation.

**Don't** use the accent orange (`#FF6B35`) for error states. Error messaging uses the Night-shift red (`#F43F5E`) because it is already semantically loaded and universally understood as a warning signal in this app's context.
