# Light-theme secondary button rim — design

**Date:** 2026-06-29 · **Bead:** purses-732j · **Branch:** kg/light-secondary-button-rim

## Problem
The `secondary` button fill (`content-soft`) ≈ its background in light: on the
active-session panel (also `content-soft`) it's ~1:1, and on light surfaces
(`surface` `#E5EEF0`) ~1.1:1 — so the button reads as plain text, failing WCAG
2.1 **1.4.11** (non-text contrast ≥3:1) and hurting tap-first discoverability.
PR #255 fixed this in *dark* with a `dark:border-ink-soft` rim but left light
untouched (owner's "don't change the light theme" at the time).

## Fix (minimal, symmetric)
Make the rim unconditional: `Button.tsx` secondary
`dark:border dark:border-ink-soft` → **`border border-ink-soft`**. One token,
both themes:
- light: `ink-soft` `#434F57` rim vs `content-soft` panel = **6.20:1** (vs
  surface 7.14, vs ground 6.33) — clears 3:1.
- dark: unchanged in effect (already had the `ink-soft` rim via `dark:`; `ink-soft`
  is `#B0C6CB` there).

`ink-soft` is the secondary-text role colour, so a secondary-coloured rim is
coherent (not the `primary` action hue, not `hairline` which is only ~1.1:1 in
light). No token-value changes; no other variant touched.

## Verification
- Update `Button.test.ts`: the rim is now both-theme (`border` + `border-ink-soft`),
  not `dark:`-only; drop the "no border in light" assertion.
- Non-text 1.4.11 is already covered by the existing `ink-soft on content-soft`
  (≥4.5) pairing in `contrast.test.ts` (6.20 ≥ 4.5 ≥ 3.0).
- Gates: test:ci / lint / build. Light screenshot: the secondary buttons (Set
  aside, Add photos, Never mind) now read as defined controls, panel no longer
  swallows them; dark unchanged.

## Not doing
No new tokens; no change to primary/ghost/danger; no light token-value changes.
Trivial diff — skips the full adversarial panel (one className + test), but keeps
the AA proof and the screenshot.
