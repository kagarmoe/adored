# Luminous Design System — Design Spec

**Date:** 2026-06-09
**Issue:** purses-agp (revise DESIGN.md from domestic to a luminous/airy North Star). Governed by
[`TONE.md`](../../TONE.md). Related: purses-o93 (consumes the system), purses-bv5 (rename).

## Goal

Replace the domestic "Lamplit Sitting Room" visual direction (warm parchment, espresso chrome) with
a **luminous, airy, gallery-cool, colour-forward** system on a neutral-white ground. The feel is
unchanged and still governed by `TONE.md`; only the aesthetic register changes. Resolves the
owner's "the colours are ugly / the whole system is wrong" assessment.

## North Star — "The Luminous Gallery"

Soft daylight and open space. The product looks like a bright, quiet gallery where one cherished
object is presented at a time, against clean white, with committed colour as a real protagonist —
not the cosy warmth of a lamplit room. The object's own photograph is the loudest thing on screen;
the chrome is calm but no longer colourless. Airy, contemporary, reverent. Still calm, judgement-free,
and one-decision-at-a-time per `TONE.md`.

## Colour system

Two **separate** systems that never trade places (see the named rule below).

### Ground & surfaces

- **Ground: neutral white** (`#FFFFFF`, or a derived whisper off-white if layered surfaces need it —
  decided at derivation, but the ground reads as neutral white, never warm).
- Surfaces (cards, dialogs) are white and **lift by soft shadow + a hairline**, not by tone — a change
  from the old warm tonal layering. Shadows are cool/neutral and soft (no hard black, no warm tint).
- This subsection describes the **light theme**; the dark theme has its own section below.

### Brand / expressive palette (from Joen Wolfrom's Essential Color deck)

| Hex | Name | Role |
|---|---|---|
| `004A67` | deep teal | The one deep anchor: primary action, progress, links, selection. Action colour only — **never headings**. |
| `CAE4E1` | pale aqua | Soft fill / palest surface tint / lightest tier. |
| `98CEDD` | sky | Content, soft accent, tier. |
| `79AFE0` | cornflower | Content, accent, tier. |
| `B3BFD8` | periwinkle | Cool neutral; benign-state chips (e.g. "Not yet"). |
| `C9BF29` | citron | **Lone spark** — affirmation moments only, sparing, dark text on it; never in a caution/warning context. |
| `D9C7D1` | soft mauve | **Gentle non-state decoration only** — never a state, tier, or action colour. |

Dropped: `550037` aubergine and `D9B6CA` (earlier candidates, retired).

### Semantic / safety palette (reserved, separate, soft, conventional)

Follows ANSI Z535 / learned UX colour meaning. Soft per `TONE.md` (no fire-engine alarm).

| Hex (approx) | Meaning |
|---|---|
| `B0463C` | error / destructive — **true irreversible danger only** |
| `C58A2E` | warning |
| `5C7C57` | success |
| `3C7E96` | info / notice |

### Named rule — "Brand never speaks Danger"

Safety-coded hues (red, amber, yellow, green) are reserved for their conventional meanings. The
expressive palette never poaches them, and they are never used decoratively. Red appears only on
genuinely destructive, irreversible actions, and even then it is sober, not a fire alarm. This pairs
with the existing colour-blind-safety rule (never distinguish by hue alone).

### Tiers — Love / Like / Maybe / Onward

A single **cool value-ramp**: deeper = more loved, palest = Onward. No tier gets a "bad" colour;
**Onward** (the former Release/letting-go tier) is simply the quietest — never red, never rejected.

| Tier | Hex | Note |
|---|---|---|
| Love | `004A67` | deepest |
| Like | `79AFE0` | |
| Maybe | `98CEDD` | |
| Onward | `CAE4E1` | palest, gentlest |

Every tier always carries **label + icon + position** as well — meaning never rests on hue alone, and
the ramp survives greyscale. Citron, mauve, and the semantic reds are excluded from tiers entirely.

## Typography

- **Display: Playfair Display** — high-contrast editorial serif, used **only at display sizes**: the
  decision question, collection names, and the single item being decided. Never for small or
  functional text (its thin strokes hurt legibility there).
- **UI & body: Inter** — all functional, dense, or repeated text (labels, buttons, helper, metadata,
  list data).
- **Headings are neutral ink, never teal or colour** — near-black on light, near-white on dark. Colour
  (teal) is reserved for actions, links, and progress, so headings stay editorial and there are no blue
  headings in either theme.
- Playfair leans elegant/formal; the warm citron, soft mauve, and gentle copy are what keep it reading
  **tender, not luxury-fashion**.

(This supersedes the old Fraunces + Hanken Grotesk pairing.)

## Dark theme

The system ships **light and dark**, both first-class. Dark is a **role reassignment, not an
inversion** — the same palette, re-cast so colour glows against deep ground (a gallery at night).

- **Ground:** a deep cool near-black, **`#081016`** (not pure black; keeps a faint teal cast).
  Surfaces lift by a **lighter fill + a soft glow**, not by shadow — elevation inverts relative to the
  light theme.
- **Role reassignment:** the deep teal `004A67` is too dark to lead on dark, so it recedes into the
  ground; the **light blues become the luminous, weight-carrying colours**, the **primary action
  becomes a glowing cornflower (`79AFE0`) with dark text**, and the citron sparks harder.
- **Headings:** near-white (neutral, as in the light theme — never tinted).
- **Tiers flip:** the value-ramp inverts so **brightest = most loved**, dimmest = Onward. Value still
  carries the order, so greyscale / colour-blind safety holds in dark too.
- **Semantics:** dark-adjusted (lightened for AA on the dark ground), still reserved and conventional;
  red is still danger-only.
- **Citron, mauve, and the semantic reds** keep their reserved roles in both themes.

Exact dark token values are derived at implementation (see Derivation), with an independent AA matrix.

## Copy

- The fourth tier is **"Onward"** (replaces "Release" / "letting go" — too clinical / grief-adjacent).
- Love / Like / Maybe unchanged. Internal enum values (`top/high/medium/low`) are unchanged; "Onward"
  is the new display label for the `low` tier.

## Accessibility (unchanged targets, re-verified for the new palette)

- WCAG 2.1 AA on every text/UI pairing.
- Colour-blind safety via value + label + icon + position (never hue alone).
- `prefers-reduced-motion` honoured.
- Tablet-first, tap-first, ≥44px targets; no swiping.

## Derivation requirements (resolved during implementation)

1. **Ink scale.** Body text is a neutral dark slate (not teal everywhere); teal is reserved for
   primary actions, links, and display headings. Derive AA-passing body, secondary, and muted inks on
   white.
2. **Surface elevation.** Define soft, cool shadow tokens (resting "lift" + raised) and the hairline
   colour; confirm whether the ground is pure `#FFFFFF` or a whisper off-white so white cards still
   separate.
3. **Tint/shade steps.** Derive OKLCH light/dark steps for each brand colour and `-soft`/`-deep`
   variants for each semantic colour.
4. **AA verification matrix.** Ink-on-white, teal-on-white, white-on-teal, dark-ink on each light
   blue and each tier chip, dark text on citron, and every semantic pairing.
5. **Dark theme token set.** Derive the full dark palette (ground/surfaces/ink/blues/citron/semantics),
   the flipped tier ramp, and run the AA matrix independently against the dark ground.

## Scope — files the implementation will touch

- **`DESIGN.md`** — rewrite §1 Overview/North Star, §2 Colours, §3 Typography, §4 Elevation, §5
  Components, §6 Do's & Don'ts; replace the YAML frontmatter tokens; add the "Brand never speaks
  Danger" rule.
- **`.impeccable/design.json`** — canonical OKLCH values.
- **Tailwind token layer** (`globals.css` / config) — apply the new tokens.
- **Theming mechanism** — light + dark token sets exposed as CSS custom properties; honour
  `prefers-color-scheme` with a persisted manual toggle. Both token sets live in the `DESIGN.md`
  frontmatter and `.impeccable/design.json`.
- **`PRODUCT.md`** — fold in the deferred entangled-household note (the pile isn't assumed wholly the
  person's; see purses-1an).

## Out of scope / flagged

- The feature beads (o93, ib3, oub, x5u, z76, 1an) — they *consume* this system but are separate work.
- **Component reskin audit.** Swapping the token layer cascades, but any component that references the
  old token *names* directly (e.g. `espresso`, `vellum`, `oxblood`, `gold`) must be migrated. This
  audit may be sizeable and is the main implementation risk — the implementation plan must inventory
  old-token references before swapping, so nothing silently keeps the parchment palette.
