# Dark-theme elevation fix — "elevation by light, not shadow"

**Date:** 2026-06-29
**Bead:** purses-2u9f
**Branch:** kg/dark-theme-elevation

## Problem

In dark mode the page, cards, and footer read as one dark mass, and the footer
is a saturated teal slab. The owner's diagnosis: dark mode leans on drop-shadows
(invisible on the near-black `#001B21` ground) instead of the designed
rim + raised-surface + glow. The **palette/tokens are correct** — this is an
execution fix in how elevation/borders/surfaces are *applied*, scoped to
`[data-theme="dark"]` only. The light theme must not change.

## Evidence (reproduced against the merged build, not assumed)

Inspecting the shipped code + the #254 dark screenshots shows the codebase
already satisfies **most** of the original prompt:

| Prompt premise | Actual state | Action |
|---|---|---|
| Page bg must be `#001B21` | `AppLayout` already uses `bg-ground` (=`#001B21` in dark) | verify only |
| Cards need a rim not a shadow | `Card.tsx` already ships `border border-hairline` **+** `shadow-card`, which in dark = inset highlight + `0 0 0 1px hairline` ring + drop | verify; no change |
| Secondary text too dim | already `text-ink-soft` (`#B0C6CB`) | verify; no change |
| Links near-invisible | already `text-primary` (`#4FB6C7` in dark) | verify; no change |
| "Add photos" outline button border | no outline button exists — it is a filled `secondary` (aqua) button, AA-pass (ink-on-aqua ≈10:1) | no change |

**The two genuinely-off things:**

1. **Footer** (`AppLayout.tsx:40`) uses `bg-surface` (`#103F4A`) → a teal slab.
2. **Active "paused" panel** (`ActiveSessionPanel.tsx:149`) uses `bg-accent-aqua`
   with `shadow-card` → a dim box with no lift/glow.

## Approach (chosen)

**Targeted, token-only, dark-scoped.** Point the two offending components at the
tokens that *already* encode the dark rim/glow. Introduce **no new hex values**,
change **no token definitions**, and touch **no light-theme rendering**.

Mechanism: enable Tailwind's attribute-based dark variant so `dark:` utilities
key off the app's existing `[data-theme="dark"]` attribute:

```ts
// tailwind.config.ts
darkMode: ['selector', '[data-theme="dark"]'],
```

This is **additive and safe**: there are currently zero `dark:` utilities in the
codebase, dark mode is attribute-driven (`theme-script.tsx`; globals.css has no
`prefers-color-scheme` dark block), so enabling the variant changes nothing
existing and aligns the variant with how the theme already toggles.

### Changes

1. **Footer de-slab** — `AppLayout.tsx`: add `dark:bg-ground` to the `<footer>`.
   Light keeps `bg-surface`; dark recedes to `#001B21` with the existing
   `border-t border-hairline` (`#3F7FA0`) as a quiet divider. Text stays
   `text-ink-soft` (`ink-soft` on `ground` is already AA-verified, both themes).

2. **Active panel lift** — `ActiveSessionPanel.tsx:149`: add
   `dark:bg-surface-raised dark:shadow-raised` to the panel `Card`. Light keeps
   `bg-accent-aqua` + `shadow-card` (untouched). Dark switches to the raised
   surface (`#123A4E`) and `shadow-raised`, which already encodes
   *inset highlight + hairline ring + cool glow* — exactly "elevation by light."

3. **Card rims** — no change. The base `Card` already applies the rim. We
   **verify** with before/after dark screenshots; if cards still read flat we
   revisit (out of this spec's default scope).

### Explicitly NOT doing (and why)

- No new hex tokens (`#8FA8AF`, `#4F9FB0`, `#7FD4E2`): the current tokens already
  pass AA for footer text and links; adding values would change the palette the
  owner just finalized.
- No outline button variant: the "Add photos" button is `secondary` and already
  legible in dark.
- No light-theme changes.

## Testing & verification

- **Contrast (TDD):** add one pairing to `src/lib/design/contrast.test.ts` —
  `ink-soft on surface-raised` (the panel's secondary text in dark; light too) —
  asserting ≥4.5 in both themes. (`ink-soft on ground` for the footer already
  exists.) No other new pairings: no new colors are introduced.
- **Component intent locks** (matching the existing Badge-test className style):
  - `AppLayout` footer contains `dark:bg-ground` + `border-t border-hairline`.
  - The active panel className contains `dark:bg-surface-raised dark:shadow-raised`.
- **Build:** `next build` proves Tailwind emits the new `dark:` utilities.
- **Gates:** `npm run test:ci`, `npm run lint`, `npm run build`.
- **Visual:** `npm run screenshots`; confirm in **dark** the footer reads as a
  quiet divider and the active panel lifts/glows, and in **light** the surfaces
  are pixel-unchanged. Embed light+dark in the PR.

## Risks

- *Enabling `darkMode: selector` has side effects* → mitigated: no existing
  `dark:` usage; dark is attribute-only. Build + full screenshot pass confirm.
- *Tailwind same-property conflict* (`dark:shadow-raised` vs base `shadow-card`;
  `dark:bg-surface-raised` vs `bg-accent-aqua`) → the `dark:` variant carries the
  `[data-theme="dark"]` attribute selector (higher specificity than the bare
  utility), so it wins in dark and is inert in light. Verified by screenshots.
