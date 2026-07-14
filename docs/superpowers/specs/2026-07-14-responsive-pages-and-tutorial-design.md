# Responsive pages and tutorial alignment - Design spec

**Date:** 2026-07-14
**Status:** Reviewed - final adversarial review CLEAN
**Bead:** `purses-qbyq`
**Governing authorities:** [`CLAUDE.md`](../../../CLAUDE.md) workflow, [`TONE.md`](../../../TONE.md), [`PRODUCT.md`](../../../PRODUCT.md), [`DESIGN.md`](../../../DESIGN.md).

## Purpose

This session has two deliverables:

1. Every `src/app/**/page.tsx` route must have an explicit tablet/web view and phone view contract.
2. `/tutorial` must have tablet/web and phone views, and its copy must describe Adored as it works now: collections begin with photos, photos can wait in the pool, items are made when ready, and the person moves through sorting rounds toward a standing they can finalize and share.

The work is a route implementation and tutorial alignment pass. It creates route-by-route responsive contracts, updates the rendered `src/app/**/page.tsx` surfaces, updates the tutorial copy and tests, and updates the walkthrough fidelity spec so future implementation follows the same model.

## Requirements

- Inventory every current `src/app/**/page.tsx` route. The route count is 29 on 2026-07-14.
- For each route, document both the tablet/web view and the phone layout.
- Phone layouts must not rely on squeezed tablet/web columns. They use one-column flow, stacked actions, and explicit touch targets.
- Phone button text must fit. If the surrounding context already supplies the object, shorten the visible label. Example: tablet/web `Begin a collection` becomes phone `Begin`.
- Redirect-only pages may point to the target route instead of owning a separate layout.
- Pages that delegate fully to a shared shell may point to that shell, but the dependent routes must be named.
- `/welcome` and `/tutorial` both delegate to `WalkthroughShell`; `/tutorial` remains dev-only and production 404s.
- The tutorial must mention the real model: collection, photos, pool, items, short rounds, standing/results, finalize/share.
- Every rendered `src/app/**/page.tsx` route must show its phone/tablet-web responsive contract in code. Redirect-only routes may point to their target page.
- Tutorial copy stays person-side and gentle: no inventory/catalog language, no shaming metrics, no gamification.

## Design

### Page layout coverage

`docs/superpowers/specs/2026-07-14-page-phone-layout-coverage.md` becomes the route-by-route responsive coverage artifact. Despite its original filename, the document now covers both tablet/web and phone views. The table has three columns:

- route file
- tablet/web view
- phone layout

The table must include exactly the 29 files returned by:

```bash
find src/app -name page.tsx | sort
```

### Route implementation coverage

The rendered route pages use page-level responsive composition where the current implementation was only tablet/web-shaped:

- Page headers stack on phone and return to rows on tablet/web.
- Primary actions become full-width on phone where they sit below the title.
- Card grids use one column on phone, then expand to two or more columns at tablet/web widths.
- Form pages keep a constrained tablet/web column, with phone spacing and full-width action rows.
- Shared `AppLayout` owns breadcrumb/action stacking for round pages and other pages that pass route actions through the shell.
- Long phone button labels use shorter visible copy while tablet/web keeps fuller labels, for example `Begin` on phone and `Begin a collection` on tablet/web.

### Tutorial layout coverage

`/tutorial` uses the same `WalkthroughShell` as `/welcome`, so it inherits the same responsive contract:

- Tablet/web: one centered beat inside a constrained shell. Compare-style beats may use side-by-side cards only when labels and images remain readable.
- Phone: one beat per screen, one-column flow, primary action below the beat, no side-by-side teaching panels when labels would crowd.

### Tutorial reality alignment

The first and last tutorial beats carry the product model:

- Purpose: "Adored helps you build a collection from photos, make items when you're ready, and notice what you love most through short rounds."
- Journey stack: "Add photos to a collection." "Make items when you're ready." "Sort in short rounds." "See what you love most."
- Handoff: "Begin with photos. They can wait in the pool until you make items." "Sort whenever you like, one gentle round at a time."

The existing middle beats already teach real mechanics through real local-mode controls: triage, usage, compare, standing, refine, and handoff. The walkthrough fidelity spec must list all seven beats in order: `purpose -> triage -> usage -> compare -> standing -> refine -> handoff`.

## Review folds

An inline adversarial review was run against this scope because the requested Superpowers subagents were not initially exposed to this Codex session. After multi-agent support became available, a delegated final review ran with QA/Test, UX, Graphic Design, and Craftsman lenses. Verdict: **CLEAN**.

- **UX finding:** a phone-only inventory did not prove tablet/web coverage. Fold: the route inventory now has a tablet/web column and a phone column.
- **QA finding:** a route inventory can drift if it is not tied to a concrete command. Fold: this spec names `find src/app -name page.tsx | sort`, and verification must compare the command count to the table count.
- **Graphic design finding:** the phone rules could allow crowded action labels. Fold: the global rules require shortened phone labels where context supplies the object.
- **Craftsman finding:** adding separate tutorial layout rules would duplicate `/welcome` because both routes render the same shell. Fold: `/tutorial` points to `WalkthroughShell`, while the shell owns the layout contract.
- **Product/UX finding:** the old photo-sampler framing did not describe the real app. Fold: tutorial copy now names collections, photos, pool, items, short rounds, standing, finalize/share.
- **Owner correction:** a documentation-only route inventory did not satisfy the session scope because the PR lacked `src/app/**/page.tsx` changes. Fold: the implementation now changes every rendered page route directly and relies on `/login` for the redirect-only `/signup` route.

## Out of scope

- Changing route ownership or auth.
- Redesigning the tutorial interaction model beyond copy and documented responsive layout.
- Production-enabling `/tutorial`; it remains dev-only.

## Verification

- `find src/app -name page.tsx | sort | wc -l` must return 29.
- The responsive inventory table must contain 29 route rows.
- A stale-string scan must find no old tutorial framing in `src` or active Superpowers specs/plans.
- Focused onboarding tests must pass:

```bash
npx vitest run src/features/onboarding/beats.test.tsx src/features/onboarding/copy-a11y.test.tsx
```

- Whitespace check:

```bash
git diff --check
```
