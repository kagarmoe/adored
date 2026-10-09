---
name: Adored
description: A luminous gallery for recognizing what you love — calm, colour-forward, light or dark.
colors:
  ground: "#dbe9ec"
  surface: "#e5eef0"
  surface-raised: "#ffffff"
  hairline: "#c7dade"
  track: "#4f7da0"
  ink: "#16242b"
  ink-soft: "#434f57"
  primary: "#004a67"
  primary-hover: "#003e5b"
  primary-ink: "#ffffff"
  content-soft: "#d7dee4"
  content-mid: "#b0beca"
  content-deep: "#4f7da0"
  content-deeper: "#4a5878"
  spark: "#efcb77"
  decor: "#b5aacc"
  error: "#9b4036"
  warning: "#9c6b22"
  success: "#3f5a34"
  info: "#2e4769"
  tier-love: "#004a67"
  tier-like: "#2f6e8c"
  tier-maybe: "#6fa0b8"
  tier-onward: "#b8d4dc"
  ground-aqua: "#a2d4d9"
  ground-mint: "#c0decc"
  ground-mid: "#e7f0ee"
  ground-end: "#d9e7e2"
  card: "#fbfcfc"
  rim: "#ffffff"
  chip: "#e3eef1"
  chip-ink: "#16242b"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  control: "10px"  # textareas, menus
  pill: "999px"  # buttons, inputs, chips
  card: "20px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
---

# Design System: Adored

> Architecture & project history: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The Luminous design system summarized there defers to this file for specifics.

> **Accountable to [`TONE.md`](TONE.md).** This is the visual and motion system that *implements* the tone contract; TONE.md is first-order and wins any conflict. Every token, rule, and component here must pass TONE.md's litmus test — does it speak from the person's side (what they feel about their things), not the machine's? When the two disagree, the fix is to change `DESIGN.md`, or to amend `TONE.md` deliberately — never to override the contract locally here. TONE states the constraints (the feel); this document chooses the mechanisms (the hex, the scale, the curve).

## 1. Overview

**Creative North Star: "The Luminous Gallery"**

Adored looks like a bright, quiet gallery where one cherished object is presented at a time. The work is affirmation, not subtraction — recognizing what matters, with letting go following naturally from that clarity. Colour is a real protagonist (it lives in the chrome, not only the content), but it is calm and committed, never loud. The object's own photograph is still the loudest thing on screen; the room around it is airy and restrained so exactly one loving choice is ever in front of the person.

The system ships in **two themes**: a default **light** (**Sea Glass** — a pale sea-glass wash under white frosted glass) and a **dark** (**Sea Glass at Night** — the same teal spine inverted toward black, where the colours glow like a gallery at night). Both are first-class and honour `prefers-color-scheme`, with a manual toggle.

It rejects every frame that treats belongings as stock: **not a catalog**, **not an inventory tool**, **not a shopping site**. It does not gamify letting go (no confetti, streaks, points, or "you have too many").

**Key characteristics:**

- A pale sea-glass wash under white frosted glass (light) / deep cool `#001B21` under night-teal glass (dark); never warm parchment, never pure black.
- One deep teal anchor for action; cool airy blues for content; a lone marigold spark; soft violet for decoration (now used freely).
- Playfair Display for the tender display moments; Inter for everything functional. Headings are neutral ink, never coloured.
- Calm density: one decision at a time, generous airy spacing.
- Surfaces lift by soft cool shadow + a hairline (light) or a hairline + glow (dark) — not by warm tone.

## 2. Colours

Two **separate** colour systems that never trade places (see the named rule below). All pairings are AA-verified by `src/lib/design/contrast.test.ts` in both themes. Tokens are CSS variables in `src/app/globals.css`; light values shown here, dark in that file.

### Brand / expressive

- **Primary — deep teal** (`#004A67`): the one anchor. Action, links, progress, focus, selection. In dark it brightens to a luminous teal (`#4FB6C7`) so it still leads. **Action only — never a heading colour.**
  - *Quiet inline links (exception).* A low-pressure inline invitation — e.g. a gentle "Add a name" on a not-yet-named item — may use `ink-soft` instead of teal where drawing the eye would read as pressure. The underline carries the affordance and contrast stays ≥ AA. A deliberate, tone-driven exception (`TONE.md` is first-order): naming follows from affection, never a nag.
- **Cool content** — `content-soft` `#D7DEE4`, `content-mid` `#B0BECA`, `content-deep` `#4F7DA0`, `content-deeper` `#4A5878` (named by **role**, soft→deeper, never by hue): content, soft fills, photo areas, identity badges (curator = `content-soft`, owner = `content-deeper`), and the benign "Not yet" chip (`content-mid`).
- **Spark — marigold** (`#EFCB77`): the lone affirmation spark. Sparing; dark text on it; never in a caution context.
- **Decor — soft violet** (`#B5AACC`): non-state decoration, now used freely (fills, backgrounds, framing) — never a state, tier, or action colour.
- **Ink** (`#16242B` light / `#ECF2F4` dark) and **Ink-soft**: text. Headings are ink, never teal.
- **Ground / surface / hairline**: the room. The sea-glass wash recedes; frosted glass sits on it, lifted by a white rim + a soft shadow, not tone.

### Glass (Frosted shelf)

**AA comes from each surface's own opacity, never from what sits behind it.** Three surface kinds, nothing else:

- **Glass-strong** (`glass-strong`, ≥ 0.85 opaque — 0.88 light, 0.92 dark) — the only token that carries `backdrop-filter` blur, with a `rim` edge. At most three per screen.
- **Glass** (`glass`, 0.52 white light / 0.5 night teal dark) — no blur, and only over the static ground wash, never over photos or moving content. It is the fill of every surface that sits on the wash: cards (grid tiles, the item panel, danger sections), the login and invitation cards, compare cards, ranking rows, save-and-share and share rows, notices, the revision note, profile/member/tutorial rows, inputs, selects, textareas, secondary buttons, the add-photo tile and the `···` trigger. Menus, popovers, the pool chooser and the image viewer float over arbitrary content and stay opaque (`surface-raised`).
- **Photo controls** (expand, carousel arrows) sit over photos, so they use `glass-strong` + `backdrop-blur-md` + a `hairline` ring (a white rim vanishes over a white photo); hover recolours the ring to `primary` (the dark fills are too close for a fill change to read).
- **`card`** (pre-composited hex) survives only as a contrast reference and for the empty-carousel placeholder.

**Ground wash** (`--ground-wash`, option A of the 2026-09-30 brainstorm): an aqua blob (`ground-aqua` `#A2D4D9`, top-left) and a mint blob (`ground-mint` `#C0DECC`, bottom-right) — each the pre-composited centre of the mock's translucent blob (aqua over the start stop, mint over the end stop), i.e. the darkest point text can sit on; blob radii are viewport units so long pages keep viewport-sized blobs — over a 160° linear base `ground` → `ground-mid` → `ground-end`. Dark keeps the flat night ground under dim aqua/mint blobs. The wash is painted on `<body>`; nothing above it (the app shell, the footer) paints an opaque fill, and `html` uses `min-height` so the wash covers the whole page instead of tiling per viewport.

**Fallbacks:** without `backdrop-filter` support, or under `prefers-reduced-transparency: reduce`, `glass` falls back to `surface` and `glass-strong` to `surface-raised` (opaque).

**Text on glass is ink, ink-soft, or a primary link over the wash (gated 4.5 on every over-wash composite); over photos, glass-strong backs controls only (primary ≥ 3:1 for edges and icons; a text button on a bar over photos, like the pool bar's Clear, uses ink). Field error messages and required asterisks are `error-deep` text (gated 4.5 on every wash stop and glass composite).** Per-component inline tints are banned — use the tokens. A source scan (`src/lib/design/no-inline-tints.test.ts`) fails on any `/NN` opacity modifier on a colour utility. Composites are declared in `globals.css` and gated by `contrast.test.ts` (each composite is proven against its token's alpha, over both ground stops and over black/white for glass-strong).

### Semantic / safety (reserved)

Soft, conventional, reserved for meaning only: **error** `#9B4036`, **warning** `#9C6B22`, **success** `#3F5A34`, **info** `#2E4769` (each with `-soft`/`-deep` variants, theme-tuned for AA). Red appears only on genuinely destructive, irreversible actions, and even then it is sober.

### Named Rules

**Brand never speaks Danger.** Safety-coded hues (red, amber, yellow, green) are reserved for their conventional meanings (ANSI Z535 / learned UX). The expressive palette never poaches them, and they are never used decoratively.

**Colour is never the sole signal.** Buckets and states pair hue with a label, icon, or position — never hue alone (colour-blind safety).

**One spark.** Marigold is the only bright accent and appears rarely; warmth otherwise comes from the soft violet and gentle copy. Nothing else competes with it.

### Tiers — Love / Like / Maybe / Onward

A single cool value-ramp: **deeper teal = more loved, palest = Onward** (the letting-go set). No tier gets a "bad" colour; Onward is simply the quietest. The ramp flips in dark (brightest = most loved). Every tier carries label + icon + position, and reads as an ordered ramp even in greyscale. Each tier uses its own AA-locked text colour (`tier-*-ink`).

## 3. Typography

**Display:** Playfair Display. **Body / UI:** Inter.

A high-contrast editorial serif for the tender moments paired with a clean, neutral humanist sans for all the work. The character lives in the display face; Inter carries everything functional.

### Hierarchy

- **Display** (Playfair, ~700, 2.25rem): the decision question, collection names, the single item being decided. The object gets the beautiful type.
- **Headline** (Playfair, ~600, 1.5rem): section headings.
- **Title** (Inter, 600, 1.1875rem): card titles, list leads, dialog titles.
- **Body** (Inter, 400, 1.0625rem ≈ 17px): prose. Cap measure ~68ch.
- **Label** (Inter, 600, 0.8125rem): buttons, fields, badges, metadata.

### Named Rules

**Display-for-soul, sans-for-sense.** Playfair appears only where feeling belongs — names, headings, the item being decided — and **only at display sizes** (its thin strokes hurt small text). Every functional or repeated string is Inter. Playfair in a UI label is a bug.

**Headings are neutral ink, never colour.** Teal is reserved for actions; a coloured heading is a bug in both themes.

## 4. Elevation

Flat by default. In **light**, surfaces sit on the sea-glass ground and lift by a soft, cool shadow + a hairline. In **dark**, surfaces lift by an inset top highlight + a luminous hairline rim + a cool glow — by light, not shadow (elevation by light, never a muddy mid-tone). No warm tint, no hard black drop shadow. Glass surfaces lift by translucency + rim (`--color-rim`) instead of shadow alone.

## 5. Components

- **Buttons:** pill radius (`rounded-pill`), min height 44px. **Primary:** teal fill, white text (dark: teal fill, dark text). **Secondary/ghost:** transparent or soft-aqua, ink/teal text. **Danger:** the reserved error red — only for truly destructive, irreversible actions; sober, not loud.
- **Quiet links:** a secondary, non-dominant text link (shared `quiet-link` token, `src/lib/design/quiet-link.ts`): `primary`-token text, underlined, ≥44px tap height (`min-h-11`), visible focus ring. Used for the quieter actions beside a single dominant button (e.g. "View all items", "Add more photos") so each surface keeps exactly **one** dominant action.
- **Cards:** 20px radius, `glass` fill + `rim` edge + soft shadow (light) / glow (dark), no backdrop-filter; the selected card uses a teal border + a check, never colour alone. Collection cards carry the owner's `···` (top-right, the `compact` trigger over the cover, above the stretched link) and no status badge — the Archived pill says it; item cards carry none — their rarer actions live on the item panel. A destructive section (delete account / delete collection) is `Card variant="danger"`: the card glass with a sober `error` rim (≥ 3:1 on `card` and on both glass composites, rows in `contrast.test.ts`), never a red wash.
- **Glass panel:** `Card variant="glass"` — glass-strong + blur + rim; reserved for panels over photos or moving content. The item panel's fields side uses the default `card` glass: it sits only on the static wash, and text on glass over the darkest wash stop is AA-gated, so field contrast stays stable.
- **Action bar:** the page's one primary action (`ActionBar`, `src/components/layout/ActionBar.tsx`).
  From `md` up an inline row where the page places it; on phone a fixed bottom bar on `glass-strong`
  + backdrop blur + a `hairline` top edge; static on a short viewport (browser zoom), never a second fixed
  band. The page reserves 9rem (`AppLayout reserveActionBar`: the bar plus a two-line error) and sets
  a matching `scroll-padding-bottom`, so the last row, the footer and a keyboard-focused card never
  sit behind it. The primary fills the bar below `md`. It holds the primary and at most one pill
  beside it (the home's **Add photos**). One per screen; with the header it is the second of the three
  glass-strong surfaces a screen may carry.
- **Selection bar:** the pool's grouping actions (`PoolActionBar`) share the action bar's surface
  (glass-strong + blur + `shadow-lift` + a `hairline` top edge, `z-30`) but stay fixed at every
  width while photos are selected — a selection follows the person through a long grid. Its height
  is reserved through `data-selection-bar` (14rem on phone, 9rem from `sm`, as page padding and
  `scroll-padding-bottom`); static on a short viewport.
- **Filter pills / chips:** `rounded-pill`, 44px; selected = `chip` fill + primary border + a check glyph, never colour alone.
- **Inputs:** surface fill, hairline border, pill radius (textareas keep 10px), 44px height; focus → teal ring; error → error border + a message, never colour alone.
- **Progress line (Sort):** a thin, numberless pill — `primary` fill inside a `content-soft` track with a 1px `track` edge (`#4F7DA0`; dark `#3F7FA0`), so the bar's full extent reads ≥3:1 on ground and the fill ≥3:1 on the track (SC 1.4.11; rows in `contrast.test.ts`). The count is screen-reader text, read on demand, never live.
- **Carousel dots:** inactive `ink-soft`, current `primary` and wider (a 16px pill), so 'current' is carried by shape as well as colour; `aria-current` for assistive tech.
- **Decision note:** an inline ask that replaces the control the person tapped (the saved result's "Make a revision" → the pins note, `MakeRevisionButton`). A `rounded-control border border-rim bg-glass px-4 py-3` panel, never `content-soft` (it merges with the ground in light and hides the ghost hover). It holds the consequence in one sentence, one `secondary` action, one `ghost` escape and at most one quiet link; no `danger` style, no modal. Focus moves to the note's text on open and back to the control when the person keeps things as they are. Text pairs: `ink` and `primary` on the glass composites (gated 4.5 in `contrast.test.ts`).
- **Badges / buckets:** tier badges use the value-ramp tokens + label + icon. Status badges are semantic where meaningful, neutral (hairline) otherwise. A **benign, in-progress** status (e.g. a paused sort) is **not** a warning — it uses a cool-blue benign chip (`content-mid` fill + `ink` text, AA-gated), never a safety/amber hue ("Brand never speaks Danger"). (`content-deep` is the deeper sibling on the ramp — a non-text fill in Sea Glass, too dark to carry AA-legible label text.)
- **Theme toggle:** top-right of the shell; 44px tap target; honours reduced-motion.
- **Wayfinding (breadcrumb + back arrow):** every authenticated page carries the breadcrumb
  trail (`Breadcrumbs`, nav labelled "Breadcrumb"); with ≥2 crumbs a chevron back arrow leads
  it, always targeting the **parent crumb** — hierarchical "up", never browser history. The
  arrow speaks `primary` (it is an action) with a 44px hit area that never changes the row
  height. Tablet: the arrow is a pointer-only shortcut (the trail itself is the
  keyboard/screen-reader path); phone: the trail collapses to one accessible
  "Back to {parent}" link. An item's trail is Collections / {collection} / {item} (no
  Items level). Trail labels come from one builder
  (`src/components/layout/breadcrumb-trails.ts`) and share the mode-chip vocabulary
  (Build/Sort/Decide). Mode chips appear on the section index pages (Photos, Decide). They do
  not appear on the collection home, whose one primary action and Add photos pill already lead
  there (owner decision, `purses-w7ss.14`). They never appear on decision surfaces or leaf pages
  ("one decision at a time"). On descendant pages the active chip marks the current *section* (`aria-current="true"`), not
  a false current page.
- **Patient waiting (Not yet):** when a deferred ("Not yet") item resurfaces, a calm banner — a cool-blue benign chip (`content-mid`) with `ink` text (not `ink-soft`: ink-soft on sky fails light-theme AA) plus a non-state moon glyph so hue is never the sole signal. Crossfade in with `--ease-gentle`; instant under reduced-motion. Gentle, never urgent: no remaining count, no inbox or "resting place" framing — the item simply comes back when the person is ready.

## 6. Do's and Don'ts

### Do

- **Do** treat the gallery as aesthetically rich — colour-forward, lush photography, visible craft — held in calm. **Aesthetic, not minimalist** (see [`TONE.md`](TONE.md) → "Restraint is not minimalism").
- **Do** frame the work as affirmation — "which would you reach for first?" — never as culling.
- **Do** keep one decision in view; let airy whitespace carry the calm.
- **Do** let the photographs be the richest thing on screen.
- **Do** keep the chrome to the teal anchor + cool blues; spend the marigold rarely.
- **Do** verify AA in **both** themes; honour `prefers-color-scheme` and the manual toggle.
- **Do** reserve Playfair for display moments; Inter for everything functional; headings in ink.
- **Do** honour `prefers-reduced-motion` with a crossfade or instant transition.
- **Do** support tap-first interaction with ≥44px targets; swipe only where native (carousels).

### Don't

- **Don't** strip the surface to sterile minimalism or drain colour to "look cleaner"; restraint governs noise and load, never beauty.
- **Don't** add shopping affordances — no prices, carts, or offers. Grids and cards are fine (PRODUCT.md v2).
- **Don't** gamify letting go: no confetti, streaks, points, or "you have too many."
- **Don't** let the brand speak danger — never use red/amber/yellow/green decoratively; reds are for true destructive actions only.
- **Don't** distinguish buckets or states by hue alone; always pair with label, icon, or position.
- **Don't** colour a heading, use Playfair at small sizes, or use warm parchment / pure black / cool clinical grey for the ground.
