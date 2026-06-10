# Luminous Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the warm "Lamplit Sitting Room" visual system with the luminous gallery-cool system (light + dark), governed by `TONE.md`, per `docs/plans/2026-06-09-luminous-design-system-design.md`.

**Architecture:** The codebase already uses token indirection — `src/app/globals.css` defines `--color-*` OKLCH variables, `tailwind.config.ts` maps Tailwind names to them, and components use Tailwind classes (222 references across 47 files). We redefine the variables for two themes, introduce role-based token names, bridge old names with temporary aliases so the build never breaks, migrate components to the new names, then drop the aliases. AA contrast is enforced by an automated test (the TDD spine for colour).

**Tech Stack:** Next.js App Router, Tailwind CSS (config + CSS custom properties), `next/font/google`, Vitest, `culori` (OKLCH + contrast math).

**Spec:** `docs/plans/2026-06-09-luminous-design-system-design.md`

---

## File Structure

- `src/app/globals.css` — the token source of truth: `:root` (light) + `[data-theme="dark"]` / `prefers-color-scheme` (dark) CSS variables; shadows; fonts; `color-scheme`.
- `tailwind.config.ts` — maps Tailwind colour names to the CSS variables; gains the new role-based names; old names kept as aliases during migration.
- `src/lib/design/contrast.test.ts` (new) — asserts every text/UI pairing meets WCAG AA in **both** themes. The colour TDD gate.
- `src/lib/design/tokens.ts` (new) — the canonical token tables (light + dark) as data, imported by the contrast test and by `globals.css` generation reference. Single source the test reads.
- `src/app/layout.tsx` — swap `next/font` Fraunces→Playfair Display, Hanken→Inter.
- `src/components/theme/ThemeToggle.tsx` (new) + `src/components/theme/theme-script.tsx` (new) — theming mechanism.
- `src/components/ui/Badge.tsx` — remap tier/status variants to the new value-ramp tokens.
- The 47 component files — mechanical class-name migration (explicit mapping in Task 8).
- `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md` — docs.

---

## Token reference (starting values — AA-tuned in Task 2)

Role-based names. Hex shown; convert to OKLCH in `globals.css`. Dark column is the second theme.

| Token | Light | Dark | Role |
|---|---|---|---|
| `ground` | `#FFFFFF` | `#081016` | page background |
| `surface` | `#FFFFFF` | `#14202A` | cards/inputs (light: +shadow; dark: lighter fill) |
| `surface-raised` | `#FFFFFF` | `#1B2A35` | dialogs/active |
| `hairline` | `#ECEFF1` | `#243640` | borders/dividers |
| `ink` | `#16242B` | `#ECF2F4` | primary text + headings |
| `ink-soft` | `#5B6B73` | `#9FB3BC` | secondary text |
| `primary` | `#004A67` | `#79AFE0` | action/links/progress/selection |
| `primary-ink` | `#FFFFFF` | `#081016` | text on `primary` |
| `primary-hover` | `#013A51` | `#9AC2E8` | hover/active |
| `accent-aqua` | `#CAE4E1` | `#CAE4E1` | soft fill / content |
| `accent-sky` | `#98CEDD` | `#98CEDD` | content |
| `accent-cornflower` | `#79AFE0` | `#79AFE0` | content |
| `accent-periwinkle` | `#B3BFD8` | `#3A4A5E` | benign-state chips |
| `spark` | `#C9BF29` | `#D7CD3A` | lone affirmation spark |
| `spark-ink` | `#2A2705` | `#081016` | dark text on spark |
| `decor` | `#D9C7D1` | `#5E4A55` | gentle non-state decoration |
| `error`/`-soft`/`-deep` | `#B0463C` / `#F4DAD6` / `#8A3128` | `#E08A80` / `#2A1714` / `#F4DAD6` | destructive only |
| `warning`/`-soft`/`-deep` | `#C58A2E` / `#F6E6CC` / `#7E5616` | `#E0B266` / `#241B0E` / `#F6E6CC` | warning |
| `success`/`-soft`/`-deep` | `#5C7C57` / `#DCE7D9` / `#3C5238` | `#8FB089` / `#16201400` `#152017` / `#DCE7D9` | success |
| `info`/`-soft`/`-deep` | `#3C7E96` / `#D6E8EE` / `#27576A` | `#79B6CC` / `#101F25` / `#D6E8EE` | info |
| `tier-love` | `#004A67` | `#BFE6EE` | Love (light: deepest; dark: brightest) |
| `tier-like` | `#79AFE0` | `#79AFE0` | Like |
| `tier-maybe` | `#98CEDD` | `#5E83A0` | Maybe |
| `tier-onward` | `#CAE4E1` | `#334654` | Onward (light: palest; dark: dimmest) |

Tier text colour is always the theme `ink` against the chip, AA-checked. Every tier also renders a label + icon (Task 7), so hue is never the sole signal.

---

## Task 1: Add culori and the token data module

**Files:**
- Create: `src/lib/design/tokens.ts`
- Modify: `package.json` (dev dep `culori`)

- [ ] **Step 1: Install culori**

Run: `npm install -D culori @types/culori`
Expected: added to devDependencies, exit 0.

- [ ] **Step 2: Create the token data module**

Create `src/lib/design/tokens.ts` with the two theme tables as data. Use the hex values from the Token Reference table above. Shape:

```ts
export type Hex = `#${string}`;
export interface ThemeTokens {
  ground: Hex; surface: Hex; surfaceRaised: Hex; hairline: Hex;
  ink: Hex; inkSoft: Hex;
  primary: Hex; primaryInk: Hex; primaryHover: Hex;
  accentAqua: Hex; accentSky: Hex; accentCornflower: Hex; accentPeriwinkle: Hex;
  spark: Hex; sparkInk: Hex; decor: Hex;
  error: Hex; errorSoft: Hex; errorDeep: Hex;
  warning: Hex; warningSoft: Hex; warningDeep: Hex;
  success: Hex; successSoft: Hex; successDeep: Hex;
  info: Hex; infoSoft: Hex; infoDeep: Hex;
  tierLove: Hex; tierLike: Hex; tierMaybe: Hex; tierOnward: Hex;
}
export const light: ThemeTokens = { /* light column values */ };
export const dark: ThemeTokens = { /* dark column values */ };
```

Fill both objects with the hex values from the Token Reference table.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/design/tokens.ts
git commit -m "feat(design): token data module for the luminous system"
```

---

## Task 2: AA contrast test (the colour gate)

**Files:**
- Create: `src/lib/design/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/design/contrast.test.ts`. It asserts every required pairing meets WCAG AA (4.5:1 body text; 3:1 for large text / UI borders) in both themes, using culori's `wcagContrast`.

```ts
import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori";
import { light, dark, type ThemeTokens } from "./tokens";

// [foreground, background, minRatio, label]
function pairings(t: ThemeTokens): [string, string, number, string][] {
  return [
    [t.ink, t.ground, 4.5, "ink on ground"],
    [t.ink, t.surface, 4.5, "ink on surface"],
    [t.inkSoft, t.ground, 4.5, "ink-soft on ground"],
    [t.primaryInk, t.primary, 4.5, "primary-ink on primary"],
    [t.primary, t.ground, 4.5, "primary text/link on ground"],
    [t.primary, t.surface, 3.0, "primary border on surface"],
    [t.sparkInk, t.spark, 4.5, "text on spark"],
    [t.ink, t.tierLove, 4.5, "ink on Love chip"],
    [t.ink, t.tierLike, 4.5, "ink on Like chip"],
    [t.ink, t.tierMaybe, 4.5, "ink on Maybe chip"],
    [t.ink, t.tierOnward, 4.5, "ink on Onward chip"],
    [t.errorDeep, t.errorSoft, 4.5, "error-deep on error-soft"],
    [t.warningDeep, t.warningSoft, 4.5, "warning-deep on warning-soft"],
    [t.successDeep, t.successSoft, 4.5, "success-deep on success-soft"],
    [t.infoDeep, t.infoSoft, 4.5, "info-deep on info-soft"],
    [t.primaryInk, t.error, 4.5, "text on error (destructive button)"],
  ];
}

describe("design tokens meet WCAG AA", () => {
  for (const [theme, tokens] of [["light", light], ["dark", dark]] as const) {
    for (const [fg, bg, min, label] of pairings(tokens)) {
      it(`${theme}: ${label} >= ${min}:1`, () => {
        expect(wcagContrast(fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
```

- [ ] **Step 2: Run it and watch failures**

Run: `npx vitest run src/lib/design/contrast.test.ts`
Expected: some pairings FAIL (the starting hexes aren't all AA yet — notably light-blue tier chips with `ink`, and dark semantic `-soft` pairings).

- [ ] **Step 3: Tune token values in `tokens.ts` until green**

Adjust the failing colours in `src/lib/design/tokens.ts` (darken inks, deepen `-deep` semantic text, or lighten chip backgrounds) — keep each within its hue family so the palette is preserved. Re-run after each change.

- [ ] **Step 4: Run until all pass**

Run: `npx vitest run src/lib/design/contrast.test.ts`
Expected: PASS, both themes, every pairing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/contrast.test.ts src/lib/design/tokens.ts
git commit -m "test(design): enforce WCAG AA on all token pairings, both themes"
```

---

## Task 3: Write the CSS variables for both themes

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the `:root` token block**

In `src/app/globals.css`, replace the existing `:root` colour/shadow/font variables with the new role-based variables, using the **AA-locked values from `tokens.ts`** converted to OKLCH (use culori or keep hex — hex is acceptable). Add a dark block. Keep the old names as **aliases** at the end of each block so existing components keep working until Task 8.

```css
:root {
  color-scheme: light;
  /* role-based */
  --color-ground: #FFFFFF;
  --color-surface: #FFFFFF;
  --color-surface-raised: #FFFFFF;
  --color-hairline: #ECEFF1;
  --color-ink: #16242B;
  --color-ink-soft: #5B6B73;
  --color-primary: #004A67;
  --color-primary-ink: #FFFFFF;
  --color-primary-hover: #013A51;
  --color-accent-aqua: #CAE4E1;
  --color-accent-sky: #98CEDD;
  --color-accent-cornflower: #79AFE0;
  --color-accent-periwinkle: #B3BFD8;
  --color-spark: #C9BF29;
  --color-spark-ink: #2A2705;
  --color-decor: #D9C7D1;
  --color-error: #B0463C; --color-error-soft: #F4DAD6; --color-error-deep: #8A3128;
  --color-warning: #C58A2E; --color-warning-soft: #F6E6CC; --color-warning-deep: #7E5616;
  --color-success: #5C7C57; --color-success-soft: #DCE7D9; --color-success-deep: #3C5238;
  --color-info: #3C7E96; --color-info-soft: #D6E8EE; --color-info-deep: #27576A;
  --color-tier-love: #004A67; --color-tier-like: #79AFE0; --color-tier-maybe: #98CEDD; --color-tier-onward: #CAE4E1;
  /* elevation: light = soft cool shadow */
  --shadow-card: 0 8px 24px oklch(0.4 0.05 230 / 0.09);
  --shadow-raised: 0 12px 30px oklch(0.4 0.05 230 / 0.13);
  /* fonts (Task 5) */
  --font-display: var(--font-playfair), Georgia, "Times New Roman", serif;
  --font-body: var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* --- transitional aliases (removed in Task 8) --- */
  --color-vellum: var(--color-ground);
  --color-vellum-deep: var(--color-hairline);
  --color-veil: var(--color-surface);
  --color-veil-raised: var(--color-surface-raised);
  --color-line: var(--color-hairline);
  --color-line-strong: var(--color-hairline);
  --color-espresso: var(--color-primary);
  --color-espresso-deep: var(--color-primary-hover);
  --color-espresso-soft: var(--color-accent-aqua);
  --color-gold: var(--color-spark);
  --color-gold-soft: var(--color-accent-aqua);
  --color-gold-soft-strong: var(--color-accent-sky);
  --color-oxblood: var(--color-decor);
  --color-oxblood-soft: var(--color-decor);
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-ground: #081016;
  --color-surface: #14202A;
  --color-surface-raised: #1B2A35;
  --color-hairline: #243640;
  --color-ink: #ECF2F4;
  --color-ink-soft: #9FB3BC;
  --color-primary: #79AFE0;
  --color-primary-ink: #081016;
  --color-primary-hover: #9AC2E8;
  --color-accent-aqua: #CAE4E1;
  --color-accent-sky: #98CEDD;
  --color-accent-cornflower: #79AFE0;
  --color-accent-periwinkle: #3A4A5E;
  --color-spark: #D7CD3A;
  --color-spark-ink: #081016;
  --color-decor: #5E4A55;
  --color-error: #E08A80; --color-error-soft: #2A1714; --color-error-deep: #F4DAD6;
  --color-warning: #E0B266; --color-warning-soft: #241B0E; --color-warning-deep: #F6E6CC;
  --color-success: #8FB089; --color-success-soft: #152017; --color-success-deep: #DCE7D9;
  --color-info: #79B6CC; --color-info-soft: #101F25; --color-info-deep: #D6E8EE;
  --color-tier-love: #BFE6EE; --color-tier-like: #79AFE0; --color-tier-maybe: #5E83A0; --color-tier-onward: #334654;
  /* dark elevation = glow + border, softer shadow */
  --shadow-card: 0 0 0 1px var(--color-hairline);
  --shadow-raised: 0 8px 30px oklch(0 0 0 / 0.5);
  /* aliases inherit via the same names above */
}
```

(If any value here differs from `tokens.ts` after Task 2 tuning, use the `tokens.ts` value — it is the source of truth.)

- [ ] **Step 2: Update the body background/gradient**

Replace the `body` background (currently the warm vellum gradient) with a flat `--color-ground` and `color: var(--color-ink)`. Remove the warm radial gradient.

- [ ] **Step 3: Verify build compiles the CSS**

Run: `npm run build`
Expected: exit 0 (no CSS/type errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): light + dark token variables with transitional aliases"
```

---

## Task 4: Extend the Tailwind config with role-based names

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add the new colour names**

In `tailwind.config.ts` `theme.extend.colors`, add the role-based names pointing at the new variables, keeping the existing old names (they now resolve through the aliases):

```ts
ground: "var(--color-ground)",
surface: { DEFAULT: "var(--color-surface)", raised: "var(--color-surface-raised)" },
hairline: "var(--color-hairline)",
ink: { DEFAULT: "var(--color-ink)", soft: "var(--color-ink-soft)" },
primary: { DEFAULT: "var(--color-primary)", ink: "var(--color-primary-ink)", hover: "var(--color-primary-hover)" },
accent: {
  aqua: "var(--color-accent-aqua)", sky: "var(--color-accent-sky)",
  cornflower: "var(--color-accent-cornflower)", periwinkle: "var(--color-accent-periwinkle)",
},
spark: { DEFAULT: "var(--color-spark)", ink: "var(--color-spark-ink)" },
decor: "var(--color-decor)",
info: { DEFAULT: "var(--color-info)", soft: "var(--color-info-soft)", deep: "var(--color-info-deep)" },
tier: {
  love: "var(--color-tier-love)", like: "var(--color-tier-like)",
  maybe: "var(--color-tier-maybe)", onward: "var(--color-tier-onward)",
},
```

Leave `success`/`warning`/`error` as-is (names unchanged, values updated via CSS vars). Update the `boxShadow` entries to reference `--shadow-card`/`--shadow-raised`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(design): expose role-based Tailwind colour tokens"
```

---

## Task 5: Swap fonts to Playfair Display + Inter, neutral headings

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the font imports**

In `src/app/layout.tsx`, replace the Fraunces/Hanken imports and instances:

```ts
import { Playfair_Display, Inter } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-playfair",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
```

Update the `<html>`/`<body>` className to use `playfair.variable` and `inter.variable` (replacing `fraunces.variable`/`hanken.variable`).

- [ ] **Step 2: Verify build and fonts load**

Run: `npm run build`
Expected: exit 0; Next fetches Playfair Display + Inter.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(design): Playfair Display (display) + Inter (UI) fonts"
```

---

## Task 6: Theming mechanism (prefers-color-scheme + persisted toggle)

**Files:**
- Create: `src/components/theme/theme-script.tsx`
- Create: `src/components/theme/ThemeToggle.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the no-flash theme script**

Create `src/components/theme/theme-script.tsx` — a component returning an inline `<script>` that sets `data-theme` on `<html>` before paint, from `localStorage` (`pi-theme`) or `prefers-color-scheme`:

```tsx
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('pi-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
```

- [ ] **Step 2: Render it in the head**

In `src/app/layout.tsx`, render `<ThemeScript />` at the top of `<head>` (or before `<body>` content) so it runs before paint.

- [ ] **Step 3: Add the toggle control**

Create `src/components/theme/ThemeToggle.tsx` (`"use client"`): a 44px tap-target button that reads the current `data-theme`, flips it, writes `localStorage('pi-theme')`, and sets the attribute. Calm copy/icon (sun/moon), no animation beyond a gentle crossfade; honour `prefers-reduced-motion`.

```tsx
"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "light");
  }, []);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pi-theme", next); } catch {}
    setTheme(next);
  }
  return (
    <button onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="h-11 min-w-11 rounded-md text-ink hover:bg-accent-aqua/40 px-3">
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
```

Place `<ThemeToggle />` in the top-right of the app shell (next to the user profile — see `src/components/layout/Header.tsx`).

- [ ] **Step 4: Verify both themes switch**

Run: `npm run dev`, load a page, toggle. Expected: instant theme switch with no flash on reload; `data-theme` persists.

- [ ] **Step 5: Commit**

```bash
git add src/components/theme/ src/app/layout.tsx src/components/layout/Header.tsx
git commit -m "feat(design): dark/light theming with no-flash script and toggle"
```

---

## Task 7: Remap the bucket/status Badge to the tier ramp + "Onward"

**Files:**
- Modify: `src/components/ui/Badge.tsx`
- Test: `src/components/ui/Badge.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Badge.test.tsx` asserting the four tier variants render the tier token classes and that a tier always pairs hue with a non-colour cue (the variant string is applied):

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge tier variants", () => {
  it("maps tiers to the value-ramp tokens", () => {
    const { container } = render(<><Badge variant="top">Love</Badge><Badge variant="low">Onward</Badge></>);
    expect(container.innerHTML).toContain("bg-tier-love");
    expect(container.innerHTML).toContain("bg-tier-onward");
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/components/ui/Badge.test.tsx`
Expected: FAIL (current classes are `bg-gold-soft-strong` / `bg-vellum`).

- [ ] **Step 3: Remap the variants**

In `src/components/ui/Badge.tsx`, change the tier variants to the new tokens with `ink` text (AA-locked in Task 2):

```ts
top: "bg-tier-love text-ink",      // Love
high: "bg-tier-like text-ink",     // Like
medium: "bg-tier-maybe text-ink",  // Maybe
low: "bg-tier-onward text-ink",    // Onward
```

Update status variants off the old warm tokens: `draft/active/curator` → `bg-accent-aqua text-ink`; `paused` → `bg-warning-soft text-warning-deep`; `finalized/completed` → `bg-success-soft text-success-deep`; `deleted` → `bg-error-soft text-error-deep`; `owner` → `bg-spark/30 text-ink`; `pending/abandoned/archived` → `bg-surface text-ink-soft`.

- [ ] **Step 4: Run until green**

Run: `npx vitest run src/components/ui/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Badge.tsx src/components/ui/Badge.test.tsx
git commit -m "feat(design): tier badges use the cool value-ramp; Onward"
```

---

## Task 8: Migrate components off the old token names; drop aliases

**Files:**
- Modify: the 47 files listed by the audit grep (below)
- Modify: `src/app/globals.css` (remove the alias block), `tailwind.config.ts` (remove old names)

- [ ] **Step 1: Find every old-token class reference**

Run: `grep -rERn "(bg|text|border|ring|from|to|via)-(vellum|veil|veil-raised|ink|ink-soft|line|line-strong|espresso|espresso-deep|espresso-soft|gold|gold-soft|gold-soft-strong|oxblood|oxblood-soft|primary)(-[a-z-]+)?" src` to produce the working list.

- [ ] **Step 2: Apply the mechanical mapping, file by file**

For each file, replace classes per this exact mapping (left → right). The semantics carry over because the aliases pointed the same way:

| Old class root | New class root |
|---|---|
| `vellum`, `vellum-deep` | `ground` (page bg), `hairline` (wells/edges) |
| `veil` | `surface` |
| `veil-raised` | `surface-raised` |
| `ink`, `ink-soft` | `ink`, `ink-soft` (unchanged names — keep) |
| `line`, `line-strong` | `hairline` |
| `espresso`, `primary` | `primary` |
| `espresso-deep` | `primary-hover` |
| `espresso-soft` | `accent-aqua` |
| `gold`, `gold-soft`, `gold-soft-strong` | `spark` (only true garnish), else `accent-aqua`/`accent-sky` |
| `oxblood`, `oxblood-soft` | `decor` (or `accent-cornflower` if it was a content cover) |

After each file, run `npm run build` and visually check that file's screen in both themes (`npm run dev`, toggle). Commit per logical group (ui/, features/collections/, features/items/, features/sorting/, features/sessions/, features/results/, app/ routes).

- [ ] **Step 3: Remove the transitional aliases**

Once the Step 1 grep returns **zero** old-token references, delete the alias block from `src/app/globals.css` and the old colour names from `tailwind.config.ts`.

- [ ] **Step 4: Verify nothing references removed tokens**

Run: `grep -rEn "(vellum|veil|espresso|oxblood|\bgold\b|line-strong)" src` → expect **no matches** in `.tsx`/`.css` (only allowed in comments/docs).
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(design): migrate components to role-based tokens; drop aliases"
```

---

## Task 9: Rewrite DESIGN.md, design.json, and the PRODUCT.md note

**Files:**
- Modify: `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`

- [ ] **Step 1: Rewrite `DESIGN.md`**

Replace the frontmatter token block with the new light tokens (and note dark in the body). Rewrite §1 Overview (North Star → "The Luminous Gallery"), §2 Colours (the new palette + the **"Brand never speaks Danger"** named rule + tier value-ramp), §3 Typography (Playfair + Inter, neutral headings), §4 Elevation (light shadow / dark glow), §5 Components, §6 Do's & Don'ts (replace warm rules; add Z535 rule; "no blue headings"). Keep the `> Accountable to TONE.md` note.

- [ ] **Step 2: Update `.impeccable/design.json`**

Replace its canonical colours/type with the new light token values (OKLCH).

- [ ] **Step 3: Add the entangled-household note to `PRODUCT.md`**

In the `## Users` section, add a sentence: the collection is not assumed to be wholly the person's — the pile may contain others' belongings (children's things, a partner's tools), which the product must let the person set aside without a decision (see `purses-1an`).

- [ ] **Step 4: Verify**

Run: `npm run build` → exit 0. Confirm `DESIGN.md` frontmatter parses (no YAML errors).

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md .impeccable/design.json PRODUCT.md
git commit -m "docs(design): rewrite DESIGN.md for the luminous system; entangled-household note"
```

---

## Task 10: Full verification and PR

- [ ] **Step 1: Gate**

Run: `npm run test:ci && npm run lint && npm run build`
Expected: all exit 0; the contrast test and Badge test pass.

- [ ] **Step 2: Manual both-theme pass**

Run `npm run dev`; walk the core screens (collections, items, a sort session: triage → compare → results) in **light and dark**, toggling. Confirm: no warm/parchment colour remains, headings are neutral, reds appear only on destructive confirms, tiers read as a ramp, citron is a rare spark, contrast looks right.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/luminous-design-system
gh pr create --title "feat(design): luminous design system (light + dark) — purses-agp" --body "Implements docs/plans/2026-06-09-luminous-design-system-design.md. Closes purses-agp."
```

- [ ] **Step 4: After merge, close the bead**

```bash
bd close purses-agp
```

---

## Self-Review

- **Spec coverage:** North Star (Task 9) · white ground + surfaces (Task 3) · brand palette w/ roles (Tasks 3–4) · reserved semantics + "Brand never speaks Danger" (Tasks 3, 9) · tiers Love/Like/Maybe/Onward value-ramp (Tasks 2, 7) · Playfair+Inter (Task 5) · neutral headings (Tasks 3/9 + ink token) · dark theme (Tasks 3, 6) · theming mechanism (Task 6) · AA both themes (Task 2) · colour-blind via label+icon+position (Task 7 + value-ramp) · derivation ink/surface/AA/dark (Tasks 1–3) · file scope DESIGN.md/design.json/tailwind/globals/PRODUCT.md (Tasks 3–9) · component-reskin audit (Task 8). All covered.
- **Placeholder scan:** token starting values are concrete; exact final values are locked by the Task 2 AA gate (not a placeholder — a verification step with given inputs). Migration is a complete explicit mapping, not "similar to".
- **Type consistency:** token names in `tokens.ts` (Task 1), the CSS variables (Task 3), the Tailwind names (Task 4), and the Badge/component classes (Tasks 7–8) all use the same role vocabulary (`ground/surface/ink/primary/accent-*/spark/decor/tier-*`).
