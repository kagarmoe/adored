# Dark-theme Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** In dark mode, make surfaces separate by light (rim/glow) instead of invisible drop-shadows — de-slab the footer, lift the active panel, and keep its controls distinguishable — without changing token values or the light theme.

**Architecture:** Enable Tailwind's `[data-theme="dark"]` selector dark variant, then add `dark:` overrides on two components that point at tokens which already encode the dark rim/glow (`--color-ground`, `--color-surface-raised`, `--shadow-raised`), plus a dark hairline rim on the `secondary` button for WCAG 1.4.11.

**Tech Stack:** Next.js App Router, Tailwind 3.4.1 (CSS-var tokens), Vitest, Playwright screenshots, culori (contrast).

## Global Constraints

- **Scope:** `[data-theme="dark"]` only — light theme rendering must be pixel-unchanged.
- **No token-value changes**, no new hex colors. Use existing semantic tokens.
- **WCAG 2.1 AA:** text ≥4.5:1; UI-component non-text ≥3:1 (1.4.11).
- Dark token values (verbatim, `globals.css`): ground `#001B21`, surface `#103F4A`, surface-raised `#123A4E`, hairline `#3F7FA0`, ink-soft `#B0C6CB`, accent-aqua `#173F4D`.
- Override-wins is **source-order, not specificity** (Tailwind `:where()` codegen) — proven only by the dark screenshot, not unit tests. Don't claim otherwise.

---

### Task 1: Enable Tailwind attribute-based dark variant

**Files:** Modify `tailwind.config.ts` (add `darkMode`).

**Interfaces:** Produces: the `dark:` variant keyed on `[data-theme="dark"]`, consumed by Tasks 3-4.

- [ ] **Step 1:** Confirm no existing `dark:` utilities or `darkMode` key (already verified: `grep -rn "dark:" src` → none; config has no `darkMode`). If any appear, stop and reassess.
- [ ] **Step 2:** Add to `tailwind.config.ts` config object: `darkMode: ['selector', '[data-theme="dark"]'],` (top-level, beside `content`).
- [ ] **Step 3:** `npm run build` → expect success (additive; no existing `dark:` usage to alter).
- [ ] **Step 4:** Commit: `feat(theme): enable [data-theme=dark] Tailwind variant`.

---

### Task 2: Contrast coverage for the panel's secondary text (both themes)

**Files:** Modify `src/lib/design/contrast.test.ts`.

**Interfaces:** Consumes `ThemeTokens.surfaceRaised`, `accentAqua`, `inkSoft` from `tokens.ts` (all exist).

- [ ] **Step 1: Add the pairings** to the `pairings(t)` array:

```ts
[t.inkSoft, t.surfaceRaised, 4.5, "ink-soft on surface-raised (active panel error text, dark)"],
[t.inkSoft, t.accentAqua, 4.5, "ink-soft on accent-aqua (active panel error text, light)"],
```

- [ ] **Step 2: Run** `npx vitest run src/lib/design/contrast.test.ts` → expect PASS (verified ratios: surface-raised 8.42/6.77; accent-aqua expected pass both themes). If accent-aqua fails in either theme, that is a real finding — surface that text differently rather than weaken the assertion.
- [ ] **Step 3: Commit:** `test(design): cover ink-soft on surface-raised + accent-aqua`.

---

### Task 3: Footer de-slab

**Files:** Modify `src/components/layout/AppLayout.tsx:40`. Test: `src/components/layout/AppLayout.test.tsx` (create if absent).

- [ ] **Step 1: Write the DOM-node tripwire test** — render `AppLayout`, query the `<footer>` (`container.querySelector("footer")`), assert its `className` contains `dark:bg-ground` AND `border-t` AND `border-hairline`. (A deletion tripwire — it does NOT prove the cascade; the screenshot does.)
- [ ] **Step 2: Run** → expect FAIL (`dark:bg-ground` absent).
- [ ] **Step 3: Implement** — add `dark:bg-ground` to the footer className (keep `bg-surface border-t border-hairline ... text-ink-soft`).
- [ ] **Step 4: Run** → expect PASS.
- [ ] **Step 5: Commit:** `fix(theme): dark footer recedes to ground, not a surface slab`.

---

### Task 4: Active panel lift + secondary button rim (1.4.11)

**Files:** Modify `src/features/sessions/ActiveSessionPanel.tsx:149`; `src/components/ui/Button.tsx:10`. Tests: `ActiveSessionPanel.test.tsx` (exists), `src/components/ui/Button.test.ts` (create).

- [ ] **Step 1: Button tripwire test** (CVA-output, like `Badge.test.ts`): `expect(buttonVariants({ variant: "secondary" })).toContain("dark:border-hairline")`. Run → FAIL.
- [ ] **Step 2:** In `Button.tsx`, secondary variant → `"bg-accent-aqua text-ink hover:bg-accent-sky dark:border dark:border-hairline"`. Run → PASS.
- [ ] **Step 3: Verify 1.4.11** — script (culori, repo root): hairline `#3F7FA0` vs surface-raised `#123A4E` and vs surface `#103F4A` must each be ≥3.0. If under 3.0, the rim is insufficient — stop and pick a stronger token. (Border color, not fill, defines the control.)
- [ ] **Step 4: Panel tripwire test** in `ActiveSessionPanel.test.tsx` — render a paused session, query the panel Card node, assert className contains `dark:bg-surface-raised` AND `dark:shadow-raised`. Run → FAIL.
- [ ] **Step 5:** In `ActiveSessionPanel.tsx:149`, change `className="border-hairline bg-accent-aqua"` → `className="border-hairline bg-accent-aqua dark:bg-surface-raised dark:shadow-raised"`. Run → PASS.
- [ ] **Step 6: Commit:** `fix(theme): lift active panel by light in dark; rim the secondary button (1.4.11)`.

---

### Task 5: Verify & ship

- [ ] **Step 1: Gates:** `npm run test:ci` (all pass), `npm run lint` (clean), `npm run build` (OK).
- [ ] **Step 2: Screenshots:** `npm run screenshots` (Docker up). Inspect **dark** `collection-paused`, `item-detail`, `members`, `triage-patient-waiting`: footer recedes to a hairline divider; active panel lifts/glows *gently* (not emphasized — it's a paused state); Set-aside button is distinguishable. Inspect **light** equivalents: pixel-unchanged vs `main`.
- [ ] **Step 3:** If a dark surface still reads flat (e.g. cards), note it for a follow-up bead — do not silently expand scope.
- [ ] **Step 4: PR** with light+dark screenshots embedded (release-asset method), referencing bead `purses-2u9f`.

## Self-Review

- **Spec coverage:** footer ✓ (T3), active panel lift ✓ (T4), button 1.4.11 ✓ (T4), contrast pairings ✓ (T2), darkMode enablement ✓ (T1), verify/screenshots ✓ (T5), "no light change / no token values" ✓ (constraints + light screenshot check). Card rims: spec says verify-only (T5 step 3).
- **Placeholders:** none — every step names the exact class string and command.
- **Type consistency:** `buttonVariants`/`badgeVariants` CVA-output pattern matches existing tests; `ThemeTokens` fields (`surfaceRaised`, `accentAqua`, `inkSoft`) confirmed in `tokens.ts`.
