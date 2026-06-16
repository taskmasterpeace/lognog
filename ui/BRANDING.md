# LogNog Branding Guide

The single source of truth for how LogNog looks. If a color, font, radius, or component
isn't defined here, it doesn't belong in the product. When in doubt, follow this file over
anything else.

> **One-line brief:** LogNog is a warm **latte / eggnog** — *espresso-dark surfaces, cream
> foam text, a honey-gold accent.* Cozy, self-hosted, approachable but professional.
> **Never** corporate-blue SaaS. No sky-blue, no purple, no pink as brand/accent colors.

---

## 1. Brand essence

| | |
|---|---|
| **Feels like** | A good cup of nog — warm, rich, comforting, a little premium. |
| **Not** | A generic amber admin template. A blue/purple "AI SaaS". A cold dashboard. |
| **Personality** | Calm, confident, plain-spoken. "Your logs, your control." |
| **Logo** | The nog mug (`LN` latte). Keep it; it's the heart of the brand. |

The three brand pillars are **chocolate** (surfaces), **cream** (text/foam), and **honey-gold**
(the one accent). Everything below serves those three.

---

## 2. Color system

### 2.1 Surfaces & text — the `nog` ramp (already in `tailwind.config.js`, keep it)

| Token | Hex | Role |
|---|---|---|
| `nog-50` | `#FAF8F5` | Lightest cream — primary text on dark; page bg in light mode |
| `nog-100` | `#F5F0E8` | Light cream — secondary text on dark; cards in light mode |
| `nog-200` | `#E8DFD0` | Warm white — borders in light; tertiary text on dark |
| `nog-300` | `#D4C4B0` | Muted tan — muted/secondary text on dark |
| `nog-400` | `#B8A68E` | Medium tan — hints, disabled, icon-muted |
| `nog-500` | `#8B7355` | Warm brown — borders on dark, dividers |
| `nog-600` | `#5A3F24` | **Chocolate (core brand)** — text on light, brand fills |
| `nog-700` | `#3D2A18` | Dark chocolate — card bg in dark mode |
| `nog-800` | `#2D1F13` | Espresso — elevated surfaces / sidebar in dark mode |
| `nog-900` | `#1E150E` | Near-black warm — **page background in dark mode** |
| `nog-950` | `#120D09` | Deepest — deepest wells, code blocks |

**Dark mode (the default, and where LogNog lives):**
- Page bg `nog-900` · cards `nog-800` · elevated/hover `nog-700` · borders `nog-700`/`nog-600`
- Primary text `nog-50` · secondary `nog-300` · muted `nog-400`
- ⚠️ **Never** use `slate-*`/`gray-*` for text in dark mode — cool grey on warm brown is the
  #1 thing that made dark mode look "muddy." Always the warm `nog` text ramp.

**Light mode:**
- Page bg `nog-50` · cards `#FFFFFF` · borders `nog-200`
- Primary text `nog-800` · secondary `nog-600` · muted `nog-500`

### 2.2 Accent — `honey` (NEW; this is the missing piece — add to `tailwind.config.js`)

The one accent. Used for: primary buttons, active nav, links, focus rings, key chart series,
selected states. A warm honey-gold — the golden foam of a nog. Replaces all current
`amber-*`/`orange-*` accent usage and the misnamed blue `lognog` ramp.

```js
honey: {
  50:  '#FBF3E3',
  100: '#F6E4C2',
  200: '#EFD194',
  300: '#E6BB63',
  400: '#DCA23E',  // hover state on dark
  500: '#C8862B',  // PRIMARY ACCENT
  600: '#A66A1E',  // pressed / accent on light bg
  700: '#845117',
  800: '#5E3A12',
  900: '#3D260C',
}
```

- **Primary accent** = `honey-500` `#C8862B`. **Text on accent** = `nog-800` `#2D1F13` (espresso, never white).
- Hover (on dark) = `honey-400`; pressed = `honey-600`.
- Tint backgrounds / accent badges = `honey-100` with `honey-700` text.
- It's deeper/warmer than default Tailwind `amber-500` (`#f59e0b`) on purpose — reads
  caramel, not neon-warning.

### 2.3 Severity / log-level colors (functional — legibility wins here)

Log levels MUST be instantly distinguishable, so this is the ONE place a controlled
multi-hue palette is allowed. Keep them slightly muted so they harmonize with the warm base.

| Level (syslog) | Color | Hex |
|---|---|---|
| Emergency / Alert / Critical (0–2) | red | `#DC2626` |
| Error (3) | orange-red | `#EA580C` |
| Warning (4) | amber | `#CA8A04` |
| Notice (5) | green | `#16A34A` |
| Info (6) | teal | `#0D9488` |
| Debug (7) | warm grey | `#78716C` |

Teal/green/red here are **functional data colors, not brand colors** — that distinction is the
whole rule: *brand chrome is warm-only; data may be multi-hue.*

### 2.4 Chart palette (ordered; dark-mode aware)

Define once in a shared module and import into every chart. Order matters (first series = most
prominent). Lead warm, then harmonized secondaries:

`['#C8862B', '#5A3F24', '#DCA23E', '#8B7355', '#0D9488', '#16A34A', '#A66A1E', '#D4C4B0']`

- Derive axis/grid/label colors from the active theme (`nog-300` text + `nog-700` gridlines in
  dark; `nog-600`/`nog-200` in light). **No hardcoded hex per chart.**
- ❌ Remove all `#8b5cf6` (purple), `#ec4899` (pink), `#0ea5e9` (sky) from charts.

### 2.5 Forbidden

- ❌ Sky-blue / purple / pink / teal **as brand or accent** (chrome, buttons, nav, links, logo).
- ❌ The `lognog` Tailwind palette (it's sky-blue) — rename to `honey` or delete.
- ❌ `<meta name="theme-color" content="#0ea5e9">` → set to `#5A3F24`.
- ❌ Single-color "gradients" (`from-amber-500 to-amber-500`) — flat fill instead.
- ❌ Cool `slate-*`/`gray-*` text in dark mode.

---

## 3. Typography

- **Font: Inter** (display + body), `system-ui` fallback. **It must actually load** — currently
  referenced in CSS but never loaded. Self-host via `@font-face` (woff2 in `public/`) or a
  `fonts.googleapis.com` link in `index.html`. Mono = `ui-monospace, "JetBrains Mono", monospace`
  for queries, log lines, code.
- **Two weights only:** 400 regular, 600 semibold. (No 700+ in UI chrome.)
- **Headings get `letter-spacing: -0.025em` (`tracking-tight`).**

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | `text-2xl` (24px) | 600 | tracking-tight. **Same on every page** (don't vary lg/xl/2xl) |
| Section title | `text-lg` (18px) | 600 | tracking-tight |
| Card title | `text-base` (16px) | 600 | |
| Body | `text-sm` (14px) | 400 | line-height 1.5 |
| Caption / meta | `text-xs` (12px) | 400 | muted text token |
| Mono (queries/logs) | `text-sm` (14px) | 400 | mono font |

---

## 4. Spacing, radius, layout

- **Radius: one value — `0.625rem` (10px).** Set `borderRadius.DEFAULT` to it. Controls, inputs,
  cards all use it. Modals may use `1rem`. ❌ Stop mixing `lg`/`xl`/`2xl` ad hoc.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 px. Cards `padding: 16px`. Section gap `24px`.
  Card gap `12px`.
- **Content max-width: `max-w-5xl` (64rem / 1024px)** via one shared `<PageContainer>` — don't
  set width/padding per page. (Pick 5xl and use it everywhere; stop mixing 4xl/7xl.)
- **Transitions:** scope to interactive elements (buttons, links, inputs, cards) — **not** `*`.

---

## 5. Components

- **Button — primary:** `honey-500` bg, `nog-800` text, 10px radius, hover `honey-400`,
  active `scale(0.98)`. **Secondary:** transparent bg, `nog-600` border, `nog-100` text (dark),
  hover `nog-700` bg.
- **Input:** `nog-800` bg (dark), `nog-600` border, **focus ring `honey-500`** (not amber/blue).
- **Card:** `nog-800` bg (dark) / white (light), `nog-700`/`nog-200` border, 10px radius, 16px padding,
  subtle hover elevation only on clickable cards.
- **Badges:** every variant a DISTINCT color — `error`=red, `warning`=amber, `info`=teal,
  `success`=green, `neutral`=`nog`. (Fix: `badge-info` currently equals `badge-warning`.)
- **Modal:** `nog-800` panel, `rgba(0,0,0,0.5)` scrim, 12–16px radius, max-w-2xl typical.
- **Table:** zebra rows (`nog-800`/`nog-850`-ish in dark), sticky header, capped height with
  internal scroll, mono font for log/query cells, readable (don't over-truncate the message column).
- **Empty state:** icon in a `honey-100`/`nog-700` circle + title + one-line subtext + a primary
  action. **One pattern, used everywhere.**
- **Active nav:** `honey` accent (left-border or subtle `honey-500/15` fill) — no infinite
  `animate-pulse`, no jumpy hover scale.

---

## 6. Dark/light mode

- Dark is the default & the brand home. Both must fully work.
- Add a **pre-paint inline script** in `index.html <head>` that sets the theme class from
  `localStorage` / `prefers-color-scheme` **before** first paint — kills the white flash on load.
- Charts, icons, and every text token must switch with the theme.

---

## 7. Do / Don't quick checklist

✅ Warm only for chrome: chocolate surfaces, cream text, honey accent.
✅ Load Inter for real. One radius (10px). One content width. One accent.
✅ Severity & charts may be multi-hue (functional) — harmonized & muted.
✅ Distinct badge colors. Pre-paint theme. Scoped transitions.

❌ Blue/purple/pink/teal as brand or accent. ❌ Default Tailwind `amber-*`/`slate-*` for
chrome/text. ❌ Single-color gradients. ❌ Per-page widths, radii, heading sizes. ❌ White
text on the honey accent.

---

## 8. Implementation map (what to change to make the codebase obey this)

| File | Change |
|---|---|
| `ui/tailwind.config.js` | Add the `honey` ramp; rename/remove the blue `lognog` ramp; set `borderRadius.DEFAULT: '0.625rem'`. Keep `nog`. |
| `ui/index.html` | Load Inter; `theme-color` → `#5A3F24`; add pre-paint theme script. |
| `ui/src/index.css` | `.btn-primary`/`.input` focus ring → `honey`; fix `.badge-info`; add zebra to `.table`; scope `transition-colors` off `*`; heading classes (`.page-title` etc.). |
| `ui/src/App.tsx` | Active-nav → honey; drop infinite pulse. |
| `ui/src/components/charts/*` | Replace hardcoded hex with the shared brand chart palette; theme-aware axis/grid. |
| `ui/src/pages/StatsPage.tsx`, `PublicDashboardPage.tsx` | Remove purple/pink/sky chart colors. |

When this file and the codebase disagree, the codebase is wrong — fix the code.
