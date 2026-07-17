---
name: Adored
description: A luminous gallery for recognizing what you love — calm, colour-forward, light or dark.
colors:
  ground: "#d3e2e5"
  surface: "#e5eef0"
  surface-raised: "#ffffff"
  hairline: "#c7dade"
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
  control: "10px"
  card: "16px"
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

The system ships in **two themes**: a default **light** (**Sea Glass** — a cool tinted ground from which cards rise to white) and a **dark** (**Sea Glass at Night** — the same teal spine inverted toward black, where the colours glow like a gallery at night). Both are first-class and honour `prefers-color-scheme`, with a manual toggle.

It rejects every frame that treats belongings as stock: **not a catalog**, **not an inventory tool**, **not a shopping site**. It does not gamify letting go (no confetti, streaks, points, or "you have too many").

**Key characteristics:**

- Sea-glass ground that recedes, cards rising to white (light) / deep cool `#001B21` (dark); never warm parchment, never pure black.
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
- **Ground / surface / hairline**: the room. The sea-glass ground recedes; cards rise to white by shadow + hairline, not tone.

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

Flat by default. In **light**, surfaces sit on the sea-glass ground and lift by a soft, cool shadow + a hairline. In **dark**, surfaces lift by an inset top highlight + a luminous hairline rim + a cool glow — by light, not shadow (elevation by light, never a muddy mid-tone). No warm tint, no hard black drop shadow.

## 5. Components

- **Buttons:** 10px radius, min height 44px. **Primary:** teal fill, white text (dark: teal fill, dark text). **Secondary/ghost:** transparent or soft-aqua, ink/teal text. **Danger:** the reserved error red — only for truly destructive, irreversible actions; sober, not loud.
- **Quiet links:** a secondary, non-dominant text link (shared `quiet-link` token, `src/lib/design/quiet-link.ts`): `primary`-token text, underlined, ≥44px tap height (`min-h-11`), visible focus ring. Used for the quieter actions beside a single dominant button (e.g. "View all items", "Add more photos") so each surface keeps exactly **one** dominant action.
- **Cards:** 16px radius, surface fill, soft shadow + hairline (light) / hairline + glow (dark); the selected card uses a teal border + a check, never colour alone.
- **Inputs:** surface fill, hairline border, 10px radius, 44px height; focus → teal ring; error → error border + a message, never colour alone.
- **Badges / buckets:** tier badges use the value-ramp tokens + label + icon. Status badges are semantic where meaningful, neutral (hairline) otherwise. A **benign, in-progress** status (e.g. a paused sort) is **not** a warning — it uses a cool-blue benign chip (`content-mid` fill + `ink` text, AA-gated), never a safety/amber hue ("Brand never speaks Danger"). (`content-deep` is the deeper sibling on the ramp — a non-text fill in Sea Glass, too dark to carry AA-legible label text.)
- **Theme toggle:** top-right of the shell; 44px tap target; honours reduced-motion.
- **Wayfinding (breadcrumb + back arrow):** every authenticated page carries the breadcrumb
  trail (`Breadcrumbs`, nav labelled "Breadcrumb"); with ≥2 crumbs a chevron back arrow leads
  it, always targeting the **parent crumb** — hierarchical "up", never browser history. The
  arrow speaks `primary` (it is an action) with a 44px hit area that never changes the row
  height. Tablet: the arrow is a pointer-only shortcut (the trail itself is the
  keyboard/screen-reader path); phone: the trail collapses to one accessible
  "Back to {parent}" link. Trail labels come from one builder
  (`src/components/layout/breadcrumb-trails.ts`) and share the mode-chip vocabulary
  (Build/Sort/Decide). Mode chips appear on section **index** pages only (Photos, Items,
  Sort, Decide) — never on decision surfaces or leaf pages ("one decision at a time"); on
  descendant pages the active chip marks the current *section* (`aria-current="true"`), not
  a false current page.
- **Patient waiting (Not yet):** when a deferred ("Not yet") item resurfaces, a calm banner — a cool-blue benign chip (`content-mid`) with `ink` text (not `ink-soft`: ink-soft on sky fails light-theme AA) plus a non-state moon glyph so hue is never the sole signal. Crossfade in with `--ease-gentle`; instant under reduced-motion. Gentle, never urgent: no remaining count, no inbox or "resting place" framing — the item simply comes back when the person is ready.

## 6. Do's and Don'ts

### Do

- **Do** treat the gallery as aesthetically rich — colour-forward, lush photography, visible craft — held in calm. **Aesthetic, not minimalist** (see [`TONE.md`](TONE.md) → "Restraint is not minimalism").
- **Do** frame the work as affirmation — "which do you love more?" — never as culling.
- **Do** keep one decision in view; let airy whitespace carry the calm.
- **Do** let the photographs be the richest thing on screen.
- **Do** keep the chrome to the teal anchor + cool blues; spend the marigold rarely.
- **Do** verify AA in **both** themes; honour `prefers-color-scheme` and the manual toggle.
- **Do** reserve Playfair for display moments; Inter for everything functional; headings in ink.
- **Do** honour `prefers-reduced-motion` with a crossfade or instant transition.
- **Do** support tap-first interaction with ≥44px targets; no swiping.

### Don't

- **Don't** strip the surface to sterile minimalism or drain colour to "look cleaner"; restraint governs noise and load, never beauty.
- **Don't** make this a catalog, inventory tool, or shopping site — no dense SKU grids, stock counts, or cart affordances.
- **Don't** gamify letting go: no confetti, streaks, points, or "you have too many."
- **Don't** let the brand speak danger — never use red/amber/yellow/green decoratively; reds are for true destructive actions only.
- **Don't** distinguish buckets or states by hue alone; always pair with label, icon, or position.
- **Don't** colour a heading, use Playfair at small sizes, or use warm parchment / pure black / cool clinical grey for the ground.
