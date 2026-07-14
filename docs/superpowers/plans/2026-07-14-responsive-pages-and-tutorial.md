# Responsive Pages and Tutorial Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every `page.tsx` route has tablet/web and phone layout coverage, and make `/tutorial` responsive and truthful to the current app model.

**Architecture:** This is a route implementation and tutorial alignment pass. Route coverage lives in one Superpowers spec table keyed by `src/app/**/page.tsx`; rendered route files get explicit responsive structure in code, while redirect-only routes inherit their target. `/welcome` and `/tutorial` share `WalkthroughShell`, so layout coverage is owned once by that shell and framed by both page routes. Tutorial reality alignment is enforced by component tests around the first and final beats.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Vitest, Testing Library.

## Global Constraints

- `TONE.md` is first-order: copy must stay affirming, gentle, person-side, and not inventory/catalog/shopping-site framed.
- Phone views are first-class layouts, not squeezed tablet/web views.
- Phone button text must fit. If page context already supplies the object, shorten the visible label; for example, tablet/web `Begin a collection` becomes phone `Begin`.
- `/tutorial` is dev-only and production 404s; it renders the same `WalkthroughShell` as `/welcome`.
- The route inventory count is 29 on 2026-07-14, from `find src/app -name page.tsx | sort`.

---

### Task 1: Route responsive coverage table

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-page-phone-layout-coverage.md`

**Interfaces:**
- Consumes: current route list from `find src/app -name page.tsx | sort`
- Produces: one route table with tablet/web and phone layout coverage for every page route

- [ ] **Step 1: Capture the route list**

Run:

```bash
find src/app -name page.tsx | sort
find src/app -name page.tsx | sort | wc -l
```

Expected: 29 route files.

- [ ] **Step 2: Update the coverage artifact**

Rename the document title to `Page responsive layout coverage`.

Keep global phone rules, but expand them to global responsive rules:

```markdown
1. Tablet/web remains the primary source layout unless a route-specific spec says otherwise.
2. Phone is a first-class layout, not a squeezed tablet view.
3. The main content flows in one column on phone unless a card grid can keep stable, readable tiles without text crowding.
4. Header actions move below the title or stack beside breadcrumbs only when both remain readable.
5. Primary actions are full-width or visually dominant on phone. Secondary actions stack below or become quiet links.
6. Button text must fit inside the button without wrapping or crowding. If the page context already supplies the object, shorten the label. Example: `Begin a collection` on tablet/web becomes `Begin` on phone.
```

- [ ] **Step 3: Replace the route table**

Use columns:

```markdown
| Route file | Tablet/web view | Phone layout |
|---|---|---|
```

Add one row for each of the 29 route files. Redirect-only pages may point to the target route. Shared-shell routes must name the shell.

- [ ] **Step 4: Verify count**

Run:

```bash
find src/app -name page.tsx | sort | wc -l
rg -n '^\| `src/app/.*/page\.tsx`|\| `src/app/page\.tsx`|' docs/superpowers/specs/2026-07-14-page-phone-layout-coverage.md
```

Expected: command count is 29, and table rows cover the same 29 route files.

---

### Task 2: Tutorial reality copy

**Files:**
- Modify: `src/features/onboarding/WelcomePurpose.tsx`
- Modify: `src/features/onboarding/WelcomeHandoff.tsx`
- Modify: `src/features/onboarding/beats.test.tsx`
- Modify: `src/features/onboarding/copy-a11y.test.tsx`
- Modify: `docs/superpowers/specs/2026-07-04-walkthrough-fidelity-design.md`
- Modify: `docs/superpowers/plans/2026-07-04-walkthrough-fidelity.md`

**Interfaces:**
- Consumes: `WalkthroughShell`, shared by `/welcome` and `/tutorial`
- Produces: tested tutorial copy that names collections, photos, items, rounds, standing/results, and handoff

- [ ] **Step 1: Write failing assertions**

In `beats.test.tsx`, change the `WelcomePurpose` test to expect:

```text
Adored helps you build a collection from photos, make items when you’re ready, and notice what you love most through short rounds.
```

In `WelcomeHandoff`, expect:

```text
Begin with photos. They can wait in the pool until you make items.
Sort whenever you like, one gentle round at a time.
```

In `copy-a11y.test.tsx`, expect the quiet journey phrases:

```text
Add photos to a collection.
Make items when you’re ready.
Sort in short rounds.
See what you love most.
```

- [ ] **Step 2: Run red**

Run:

```bash
npx vitest run src/features/onboarding/beats.test.tsx src/features/onboarding/copy-a11y.test.tsx
```

Expected before implementation: tests fail on the old "few photos" tutorial copy.

- [ ] **Step 3: Implement copy**

Update `WelcomePurpose.tsx` with the new collection-flow paragraph and four quiet journey lines.

Update `WelcomeHandoff.tsx` with the pool/items handoff and one-round-at-a-time sentence.

- [ ] **Step 4: Update walkthrough docs**

In the walkthrough fidelity spec and plan:

- change the previous beat count to seven beats
- include the usage beat
- replace the old photo-sampler purpose and handoff requirements
- update `BEAT_ORDER` to `["purpose", "triage", "usage", "compare", "standing", "refine", "handoff"]`

- [ ] **Step 5: Run green**

Run:

```bash
npx vitest run src/features/onboarding/beats.test.tsx src/features/onboarding/copy-a11y.test.tsx
```

Expected: 2 files pass, 32 tests pass.

---

### Task 3: Implement page route responsive layouts

**Files:**
- Modify: rendered `src/app/**/page.tsx` routes
- Modify: shared layout/form/action components only where they carry route-level phone behavior

**Interfaces:**
- Consumes: route inventory from Task 1
- Produces: direct `page.tsx` diffs for every rendered route and phone-safe nested actions

- [ ] **Step 1: Add page-level phone/tablet structure**

For every rendered route, make the responsive behavior visible in the route file:

- phone header stacks, tablet/web header rows
- phone primary actions full-width where they sit below titles
- phone grids one column when card text or controls would crowd
- constrained form columns centered on tablet/web and full-width on phone

Redirect-only `/signup/page.tsx` remains a redirect to `/login`.

- [ ] **Step 2: Shorten phone-visible labels**

Use breakpoint-specific labels where needed:

- `Begin a collection` -> `Begin`
- `Create collection` -> `Create`
- `Start session` -> `Start`
- `Accept invitation` -> `Accept`
- `Put things in order` -> `Order`

- [ ] **Step 3: Patch shared route-owned shells**

Update shared components that carry page layout across many routes:

- `AppLayout` breadcrumb/action chrome
- `EmptyState` CTA labels
- `WalkthroughShell` `/welcome` and `/tutorial` frame
- nested action bars/forms that would otherwise overflow phone buttons

- [ ] **Step 4: Add focused tests**

Add coverage for:

- phone-short empty-state CTA labels
- `AppLayout` action row stacking on phone and row restoration on tablet/web

---

### Task 4: Review and verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-responsive-pages-and-tutorial-design.md`
- Modify: `docs/superpowers/plans/2026-07-14-responsive-pages-and-tutorial.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 diffs
- Produces: review notes and verification evidence for handoff

- [ ] **Step 1: Run stale string scan**

Run:

```bash
rg -n "Gather a few photos|Start with a few photos|See where things stand|Sort whenever you like — in short rounds|anti-store line|six beats|\\[\\\"purpose\\\", \\\"triage\\\", \\\"compare\\\"" src docs --glob '!node_modules' --glob '!docs/superpowers/plans/2026-07-14-responsive-pages-and-tutorial.md'
```

Expected: no active stale tutorial strings remain.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: exit 0.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx vitest run src/features/onboarding/beats.test.tsx src/features/onboarding/copy-a11y.test.tsx
```

Expected: 2 files pass, 32 tests pass.

- [ ] **Step 4: Final review gate**

Run adversarial review with QA/Test, Craftsman, Graphic Design, and UX lenses. Required checks:

- route inventory has 29 rows for 29 page routes
- every route row has tablet/web and phone coverage
- every rendered route has a corresponding `src/app/**/page.tsx` implementation diff
- `/tutorial` points to `WalkthroughShell` for both layouts
- tutorial copy is reality-aligned and tone-compliant
- phone labels are shortened where documented

- [ ] **Step 5: Handoff**

Run:

```bash
git status --short
bd close purses-qbyq --reason "Responsive route coverage and tutorial alignment implemented and verified."
```

Expected: bead closes only after verification evidence is fresh.
