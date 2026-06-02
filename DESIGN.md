---
name: PurseInator
description: A lamplit sitting room for sorting what you love — calm, curatorial, judgement-free.
colors:
  plaster: "#f6efe6"
  chalk: "#faf6f0"
  ink: "#2b2521"
  ink-soft: "#5a5048"
  verdigris: "#3d6b54"
  verdigris-deep: "#2f5341"
  clay: "#bd7d63"
  clay-soft: "#ecd9cd"
  line: "#e4dccf"
  success: "#4f7d5f"
  warning: "#c79a52"
  error: "#b15441"
typography:
  display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "2.25rem"
    fontWeight: 460
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 460
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.verdigris}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.verdigris-deep}"
    textColor: "{colors.chalk}"
  button-secondary:
    backgroundColor: "{colors.clay-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.verdigris}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  badge:
    backgroundColor: "{colors.clay-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: PurseInator

## 1. Overview

**Creative North Star: "The Lamplit Sitting Room"**

PurseInator looks like a warm room in late-afternoon light where someone sits with a box of belongings and discovers, slowly, what they love most. The work is affirmation, not subtraction — recognizing the things that matter, with letting go following naturally from that clarity. The reference is *Cabana* magazine in print — cozy, intimate, maximalist, materially rich — not the flat tech-product look and not Cabana's own thin website. The maximalism is deliberately rehomed as affection: it lives in the user's photographs, the warm plaster-and-verdigris palette, and the old-style serif voice, never in the density of the interface. The chrome stays quiet so that exactly one loving choice is ever in front of a person who may be grieving.

The system rejects every frame that treats belongings as stock. It is **not a catalog**, **not an inventory tool**, **not a shopping site**. It does not gamify letting go (no confetti, streaks, points, or "you have too many"), and it never feels like an enterprise asset dashboard or a resale-marketplace listing screen. Warmth and a light touch of playfulness show up as small material moments, not as rewards.

**Key Characteristics:**
- Warm plaster light theme; pure white and cool gray are forbidden.
- One botanical-green action color, used sparingly; clay warmth as garnish only.
- Editorial serif (Fraunces) for soul; humanist sans (Hanken Grotesk) for everything functional.
- Calm density: one decision at a time, generous but cozy spacing.
- Flat tonal layering with one soft, warm lift; gentle 150–250ms motion.

## 2. Colors

A warm, lamplit palette: plaster and chalk neutrals carrying a deep botanical green, with terracotta clay as an occasional garnish. Composed in OKLCH; hex in the frontmatter are sRGB approximations and the canonical OKLCH values live in `.impeccable/design.json`.

### Primary
- **Verdigris** (`#3d6b54`, `oklch(0.48 0.09 155)`): the single voice of action and selection. Primary buttons, the current/selected card, focus rings, links, progress fill. Deepens to **Verdigris Deep** (`#2f5341`) on hover/active. White (Chalk) text on Verdigris clears 4.5:1.

### Secondary
- **Clay** (`#bd7d63`, `oklch(0.62 0.10 40)`): warmth and personality — small decorative moments, illustrative accents, the occasional flourish. Carries Ink text only (not white), and is never used for primary actions or error states.
- **Clay Soft** (`#ecd9cd`): tinted fills for badges, secondary buttons, and gentle highlight chips.

### Neutral
- **Plaster** (`#f6efe6`, `oklch(0.955 0.018 50)`): the body canvas. The lamplit room. Deliberately warm and faintly chromatic — not the cream/sand AI default and not a cold white.
- **Chalk** (`#faf6f0`): raised surfaces — cards, inputs, dialogs. A shade cleaner than plaster so content lifts by tone, not by heavy shadow.
- **Ink** (`#2b2521`, `oklch(0.25 0.02 50)`): primary text and high-emphasis marks. A warm near-black, never `#000`.
- **Ink Soft** (`#5a5048`): secondary text, captions, helper copy. Clears 4.5:1 on Plaster.
- **Line** (`#e4dccf`): borders and dividers. Warm and low-contrast; structure is felt, not announced.

### Semantic (muted by duty of care)
- **Success** (`#4f7d5f`), **Warning** (`#c79a52`), **Error** (`#b15441`): all desaturated. For a grieving user, even errors speak softly; no fire-engine red, no alarm.

### Named Rules
**The One Voice Rule.** Verdigris is the only hue that signals action or selection, on ≤10% of any screen. Its rarity is what makes the current decision unmistakable.

**The Clay-as-Garnish Rule.** Clay is seasoning, never substance. It may warm a badge, an illustration, or an empty-state mark; it may never be a button you press or a state that warns you.

**The No Cold Surface Rule.** Every surface is warm — Plaster or Chalk. Pure `#ffffff` and any cool/blue-tinted gray are prohibited; they break the lamplit room instantly.

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui)

**Character:** A high-contrast, old-style serif with a little soft personality (Fraunces) paired against a warm, low-contrast humanist sans (Hanken Grotesk). The pairing sits on a real contrast axis — characterful serif soul over plain-spoken sans sense — so it reads as edited, not as two fonts competing. Fraunces carries identity and feeling; Hanken carries all the work.

### Hierarchy
- **Display** (Fraunces, ~460 weight, 2.25rem, line-height 1.1): collection names, the screen's emotional heading, the single item under decision. The object gets the beautiful type.
- **Headline** (Fraunces, ~460, 1.5rem, line-height 1.2): section headings within a screen.
- **Title** (Hanken Grotesk, 600, 1.125rem, line-height 1.35): card titles, list-row leads, dialog titles.
- **Body** (Hanken Grotesk, 400, 1rem, line-height 1.55): all prose and descriptions. Cap measure at 65–75ch.
- **Label** (Hanken Grotesk, 600, 0.8125rem, +0.01em): buttons, field labels, badges, metadata. Sentence case or short caps (≤4 words) only.

### Named Rules
**The Serif-for-Soul, Sans-for-Sense Rule.** Fraunces appears only where feeling belongs — names of things, headings, the item being decided. Every dense, functional, or repeated string (labels, table data, helper text, buttons) is Hanken Grotesk. Fraunces in a UI label is a bug.

**The Fixed-Scale Rule.** Type sizes are a fixed rem scale, never fluid `clamp()`. This is product UI viewed at consistent distance; a heading that shrinks inside a sidebar looks worse, not designed.

## 4. Elevation

Flat by default with warm tonal layering: Chalk surfaces sit on the Plaster canvas and separate by tone and a hairline Line border, not by shadow. Depth is reserved as a response to lift — a single soft, warm ambient shadow on genuinely raised or interactive surfaces (the card under your finger, dialogs, popovers) — so the room feels tactile, like paper resting on a warm table, without hard gray drop shadows.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 2px 8px rgba(43, 37, 33, 0.06)`): resting interactive cards.
- **Raised** (`box-shadow: 0 8px 28px rgba(43, 37, 33, 0.10)`): dialogs, popovers, the active card mid-decision.

### Named Rules
**The Paper-on-a-Warm-Table Rule.** Shadows are warm (tinted with Ink, never pure black) and soft. A hard, dark, tight drop shadow reads as a 2014 app; if it looks cut-out, the shadow is wrong.

## 5. Components

### Buttons
- **Shape:** gently curved (10px, `{rounded.md}`); min height 44px for tap targets.
- **Primary:** Verdigris fill, Chalk text, 0 20px padding. Hover → Verdigris Deep with a 150ms color transition; active dips opacity slightly. Focus-visible → 2px Verdigris ring, 2px offset.
- **Secondary:** Clay Soft fill, Ink text. The quiet alternative to primary.
- **Ghost:** transparent, Verdigris text; hover gets a faint Verdigris-tinted wash. For low-emphasis and back actions.
- **Danger:** Error fill, Chalk text — reserved for truly destructive, irreversible actions; styled to be sober, not loud.

### Cards / Containers
- **Corner Style:** 16px (`{rounded.lg}`) — cozier than the buttons.
- **Background:** Chalk on the Plaster canvas.
- **Shadow Strategy:** flat at rest (tone + Line border); **Lift** shadow on hover/selected per Elevation.
- **Border:** 1px Line; the selected/current card swaps to a 1.5px Verdigris border (paired with a check, never color alone).
- **Internal Padding:** 20px (`{spacing.lg}`-ish).

### Inputs / Fields
- **Style:** Chalk fill, 1px Line border, 10px radius, 44px height.
- **Focus:** border shifts to Verdigris with a soft 2px Verdigris ring; no harsh glow.
- **Error:** Error border + a short Ink-readable message below; never color-only.
- **Placeholder:** Ink Soft (must hold 4.5:1, not a faint gray).

### Badges / Buckets
- **Style:** Clay Soft fill with Ink text, full-radius, label type. Bucket badges must pair hue with a label or icon — **never distinguish buckets by color alone** (color-blind safety).

### Navigation
- Top-left back arrow + breadcrumb trail (Hanken Grotesk, Ink Soft → Ink on the current crumb); top-right user profile. Quiet by default; the current location is marked with Ink weight, not a heavy fill.

## 6. Do's and Don'ts

### Do:
- **Do** frame the work as affirmation — "which do you love more?" — not as culling. Copy and motion celebrate favorites; letting go is honored quietly, never the headline.
- **Do** keep one decision in view at a time; let whitespace and pacing carry the calm.
- **Do** let the user's photographs be the loudest, richest thing on the screen.
- **Do** use Verdigris as the single action voice (the One Voice Rule, ≤10% per screen).
- **Do** keep all surfaces warm (Plaster/Chalk) and all text warm Ink — verify body text ≥4.5:1.
- **Do** reserve Fraunces for names, headings, and the item being decided; Hanken for everything functional.
- **Do** honor `prefers-reduced-motion` with a crossfade or instant transition on every animation.
- **Do** support tap-first interaction with ≥44px targets; drag is allowed for reordering/bucketing.

### Don't:
- **Don't** make this a **catalog, an inventory/storage tool, or a shopping site** — no dense SKU grids, no stock counts, no cart/"add more" affordances.
- **Don't** evoke **Marie Kondo–style gamified declutter apps**, **Poshmark/eBay selling UIs**, or **enterprise asset-management dashboards**. No KPI tiles, no everything-at-once.
- **Don't** gamify letting go: no confetti, streaks, points, scores-as-rewards, or "you have too many."
- **Don't** use `#ffffff`, cool/blue grays, or fire-engine semantic colors — they shatter the lamplit warmth and feel clinical.
- **Don't** ship Cabana's thin website energy: the richness is cozy and material, not sparse-and-trendy.
- **Don't** distinguish buckets or states by hue alone; always pair with label, icon, or position.
- **Don't** use fluid `clamp()` heading scales, hard black drop shadows, or `border-left` color stripes on cards/alerts.
