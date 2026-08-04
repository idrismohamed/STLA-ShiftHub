# STLA Shift Hub — Design System (Material 3 Expressive)

A shift-tracking PWA for factory workers on rotating crew schedules, styled as
a **Material 3 Expressive** app with a warm-orange identity. Two registers
coexist: the *utility layer* (hours, pay, lockouts) must read at a glance in a
bright plant or from a nightstand at 5 AM; the *expressive layer* (tonal
surfaces, shape morphs, springy motion) makes a dense tool feel alive rather
than clinical. Legibility always wins.

All tokens live at the top of `www/styles.css` (`:root` = dark default,
`[data-theme="light"]` = light). **New rules must use the `--md-*` /
semantic-container tokens; the legacy aliases (`--accent`, `--card`,
`--pill-*`) exist only so old selectors keep working.**

---

## Color

### Tonal surfaces (M3)

Five surface-container steps per theme create depth without shadows doing the
work alone. Dark builds on `#1A1820` (warm near-black), light on `#F3EFF7`
(soft lavender-grey):

| Token | Role |
|---|---|
| `--md-surface` | App background |
| `--md-surface-container-low` | Cards, sheets' base |
| `--md-surface-container` | Sheet cards, settings rows, stat tiles |
| `--md-surface-container-high` | Inputs, secondary buttons, pressed rows |
| `--md-surface-container-highest` | Chart tracks, deepest interactive fill |

### Color roles

| Role | Meaning | Pair |
|---|---|---|
| `--md-primary` (warm orange) | Brand: Save, Today-on-current-PP, crew chip, wavy progress | `--md-on-primary`, `--md-primary-container`, `--md-on-primary-container` |
| `--md-tertiary` (violet) | **"Today" temporal landmark only** — date circles, today cells/cards | same pattern |
| `--md-error` (rose) | Errors, destructive actions, conflict warnings | same pattern |

### Shift semantics — the app's own custom colors

The most communicative colors in the app. Each has a base tone (accents,
text, dots) **and a container pair** (fills + readable text on them). Never
reuse them for non-shift meanings:

| Custom color | Base | Used for |
|---|---|---|
| `--day` / `--day-container` / `--on-day-container` | sky blue | Day shifts |
| `--night` / `--night-container` / `--on-night-container` | rose | Night shifts |
| `--off` / `--off-container` / `--on-off-container` | emerald | Off days, OT chips, success |
| `--mod` / `--mod-container` / `--on-mod-container` | violet-lavender | Modified days, drops |
| `--vac` / `--vac-container` / `--on-vac-container` | cyan | Vacation |
| `--amber` / `--amber-container` / `--on-amber-container` | amber | Lieu days, holidays, warnings |

**Fill rule:** cells/cards get a container *wash*
(`color-mix(in srgb, var(--x-container) 55%, base)`), pills/chips get the full
container with `on-container` text, and full-saturation base tones appear only
as thin accent bars (3px cell top-strips), icons, and text. Never white text
on an alpha tint — that was the old system's light-mode failure.

### Charts

`charts.js` reads only `--c-*` vars (net, reg, ot, dt, tax, cpp, ei, prem) —
retune palettes by editing the tokens, never the JS. Light-theme fills are
deliberately softer than their text-grade counterparts.

---

## Shape

Scale: `--shape-xs 8 · sm 12 · md 16 · lg 24 · xl 28 · full 999`.

- **Concentric rule: outer radius = inner radius + padding.** Calendar card 28
  → cells 16 (12px padding); floating toolbar full-pill with 6px padding →
  full-pill buttons inside.
- **Shape-morph is the M3E signature**: interactive elements are pills/large
  radii at rest and morph *smaller* on press (`scale(0.96)` + radius → sm/md,
  on the `--spring` curve). Applied to: calendar cells, week cards, toolbar
  buttons, Save, chips, the logo badge (squircle→circle), the sliding
  view-tab indicator (pill→rounded-rect→pill mid-flight).
- **Expressive grouped lists** (settings, pay tools): rows are tonal segments
  with 2px gaps; first/last rows get 16px outer corners, middles 6px; a
  pressed row rounds up to 16px.

## Typography

Nunito variable (bundled, weights 400–900 — no CDN). Heavy skew: body 600,
labels 800, titles/numerals 900. All-caps 10–11px/800 overlines with 0.05–0.09em
tracking anchor every card. Money and hours always take
`font-variant-numeric: tabular-nums` (`.num` and the value classes in
styles.css) so figures never wiggle. Headings use `text-wrap: balance`.
Hero numerals: `clamp(17px, 6.4vw, 26px)` so tiles shrink before clipping.

## Iconography

`www/icons.js` self-injects an SVG `<symbol>` sprite (24-grid, 2px round-cap
strokes, `currentColor`) and exposes `icon(name, size, cls)` for generated
markup; static HTML uses `<svg class="shi"><use href="#i-name"/></svg>`.
**No emoji in chrome** — emoji survive only in first-run wizard copy, toast
text, notifications and exports. Icons inherit the color of the text beside
them; `.shi` handles baseline alignment.

## Motion

| Token | Curve | Use |
|---|---|---|
| `--spring` | `cubic-bezier(0.34, 1.8, 0.5, 1)` | Press morphs, tab indicator, toolbar |
| `--spring-fast` / `--spring-slow` | gentler overshoot | micro/marco entrances |
| `--sheet-ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | Sheet open |
| `--ease` | standard M3 | color/opacity |

- Enters are **split and staggered**: calendar cells 8ms, week cards 22ms,
  analytics cards 70ms (`--cell-i` / `--an-i` custom-property delays).
- Exits are softer than enters (sheets slide down on a plain ease-out).
- Selection marks cross-fade in with **opacity 0→1, scale 0.25→1, blur 4px→0**
  (`cubic-bezier(0.2,0,0,1)`) — see the filter-chip check.
- The pay-period bar is an **M3E wavy progress** (`wavyProgressHTML` in
  charts.js): scrolling sine stroke for the filled portion, flat thin track +
  stop dot for the rest.
- Everything animated is disabled under `prefers-reduced-motion` (media query
  blocks in styles.css; the wave checks `matchMedia` before adding its SMIL
  loop). Transitions list explicit properties — never `transition: all`.

## Key components

- **App bar**: M3 large top bar; day/night monogram SVG in a
  primary-container squircle; 44px icon-button gear with press rotation.
- **Floating toolbar** (bottom): tonal glass pill, `surface-container-high`
  buttons + one filled primary action.
- **Connected button group** (Month/Week/Year): tonal track, sliding
  primary indicator that shape-morphs while travelling.
- **Calendar cells**: container washes per shift, 3px base-tone top accent,
  PP stripe on the left for off days, tertiary today circle,
  container-pair pills (class names `pill-day/night/off/mod/vac/offday/...`
  are load-bearing — tests assert them).
- **Bottom sheets**: `--glass-bg` blur surface, outline drag handle, tonal
  `.sheet-card`s, **full-width sticky action footer** (never floats over
  content): text Cancel · filled Save · error-container Clear.
- **Filter chips** (`.toggle-btn`): pill outline at rest in the option's base
  tone; selected = filled container + morphing check.
- **Inputs**: tonal filled fields, 12px radius, primary focus ring.
- **Toasts**: glass pill, status icon (check/alert), 4px semantic left border.

## Do's and don'ts

- **Do** use `minmax(0, 1fr)` for every grid track inside `overflow: hidden`
  cards, and `min-width: 0` down flex chains that must shrink (the week
  header relies on this to stay single-line).
- **Do** keep hit areas ≥ 40×40px — extend small controls with an absolutely
  positioned `::after` inset, never by growing layout.
- **Do** keep today violet (tertiary). Today is a temporal landmark, not a
  shift type.
- **Don't** introduce new hardcoded colors — every hue routes through a token
  with a light+dark definition.
- **Don't** put white text on alpha tints; use the `-container`/`on-container`
  pair.
- **Don't** rename pill/cell class names or element IDs — smoke tests and JS
  target them.
- **Don't** change the PP stripe rotation order (`--pp0..3`); users build
  spatial memory of which tint is which fortnight.
