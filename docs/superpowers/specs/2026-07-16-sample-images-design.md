# Unified sample-image system — design

**Date:** 2026-07-16 (rev 2, post adversarial review)
**Branch:** kg/e2e-images
**Goals:** (1) test images get one organized, metadata-bearing home instead of scattered
fixture dirs; (2) a failing e2e test is diagnosable from the image in its screenshot.

## Problem

Sample images are scattered: demo/walkthrough images in `public/onboarding/`, e2e fixtures
in `e2e/fixtures/photos/` (CC0 jpegs + `IMG_0428.jpeg`), and a redundant third set in
`e2e/fixtures/demo-images/` (40 webps — `photo-serving.ts` searches it only as a fallback
behind `public/onboarding`). Every spec serves the same 1–3 anonymous jpegs via
`route.fulfill`, so a failure screenshot says nothing about which test produced it.

**Facts established by review (constrain the design):**

- **No e2e spec uploads a photo.** Zero `setInputFiles` in `e2e/**`; every fixture image is
  served from disk via `route.fulfill` stubs on the photo-file routes. Test images are
  filesystem reads, never HTTP assets — they must NOT live under `public/`, or they ship to
  prod (enumerable spec inventory at predictable URLs).
- **Demo images must stay under `public/`** — they are URL-served (`imageSrc` in
  `sampleData.ts`) and allowlisted as a public path in the proxy auth matcher
  (`src/proxy.ts:13`). They do not move. One shared home for both sets is therefore
  impossible without shipping test bytes; owner accepted two homes (2026-07-16).
- **Item-name metadata already exists** where it's consumed: demo names in
  `sampleData.ts` (`SAMPLE_ITEMS`), e2e item names in `e2e/fixtures/seed.ts`. No new
  manifest is needed; a `{spec, itemName, file}` manifest would have no consumer.

## Design

### 1. Layout

```
public/onboarding/               # demo images — UNCHANGED (URL-served, proxy-allowlisted)
e2e/fixtures/sample-images/
  base/                          # curated photos, committed — one per spec, named for it:
  │                              #   sort-images.webp, results-rerank.webp, …
  └── labeled/                   # sharp output, gitignored — regenerated every run
```

- Deleted: `e2e/fixtures/photos/`, `e2e/fixtures/demo-images/`,
  `scripts/fetch-demo-images.mjs`.
- `src/lib/photo-serving.ts`: `DEMO_IMAGE_DIRS` shrinks 2 → 1 (drop the
  `e2e/fixtures/demo-images` fallback; keep `public/onboarding`).
- `src/lib/photo-serving.test.ts`: the four `demoArgs` local-fallback tests (reading
  `demo-images/accessories-01.webp`) repoint to a `public/onboarding` file; the
  `onboardingArgs` cases are already correct. No coverage is lost — no test asserts the
  second search dir as a distinct behavior.
- `.gitignore` gains `e2e/fixtures/sample-images/labeled/`.

### 2. Test image set

- **One base photo per spec file** that stubs a photo route (~19: every spec referencing
  `e2e/fixtures/photos/`, including `a11y.spec.ts`), named for the spec. Owner decision
  (2026-07-16): per-spec photos kept for visual variety between specs, acknowledging the
  label carries the diagnostic signal.
- **Aesthetic contract:** single household object, red/orange/yellow dominant, modern
  editorial ("Dwell") styling — deliberately distinct from the cozy demo set, so a glance
  distinguishes demo data from test data.
- **Sourcing:** owner generates the photos from `docs/test-image-prompts.md` (shared style
  block + one object prompt per spec) and drops them in `base/`.

### 3. Label overlay (diagnosability)

`scripts/label-test-images.mjs`:

- Globs `base/*.webp` (no manifest — the filename IS the spec name and the label text).
- Composites the spec name onto each photo with sharp (already a dependency) and writes
  `labeled/<spec>.webp`. sharp's default output carries no source metadata — do not call
  `.withMetadata()`, so any AI-generator EXIF/XMP in the base photos is stripped.
- Is invoked by **appending** a step to the existing `e2e/global-setup.ts` (which already
  does DB bring-up via `test-db.sh up` — the label step composes with it, order
  irrelevant). Not a new globalSetup.
- **Output guard:** after generation, global-setup asserts every `labeled/<spec>.webp`
  exists and exceeds a minimal byte size, failing the run loudly. This is required because
  specs assert on request URLs and `<img>` visibility, never pixels — a corrupt image
  would otherwise pass silently and defeat goal 2 exactly when it matters (in the failure
  screenshot).

### 4. Spec migration

- Each spec's `PHOTO_FIXTURE` (inline constant — kept, no manifest import) points at its
  own `e2e/fixtures/sample-images/labeled/<spec>.webp`.
- `route.fulfill` stubs switch `contentType` to `"image/webp"`. Review confirmed no spec
  depends on jpeg semantics: `image-rotate.spec.ts` tests app-level rotation persistence
  (PATCH + URL version), not EXIF orientation; `image-perf.spec.ts` asserts width query
  params, not byte size.
- **Exception:** `e2e/screenshots/capture.ts` is the docs/PR screenshot harness, not a
  test — it uses a **demo** image (`public/onboarding/blue-mixing-bowl.webp`) so published
  screenshots show the app looking real.

## Alternatives considered

- **Labeled color cards (no photos):** maximum diagnosability, zero binaries; app never
  looks real in screenshots. Rejected by owner for hybrid.
- **Photos without overlay:** looks real; diagnosis needs filename↔test lookup. Rejected.
- **Shared photo pool (1–5 photos, per-spec labels):** same diagnosability, ~15 fewer
  images to generate. Offered post-review; owner kept per-spec photos (2026-07-16).
- **Move demo images to `public/sample-images/demo/`:** rejected post-review — the move
  is aesthetic, and its real blast radius includes the proxy auth matcher
  (`src/proxy.ts:13`), `middleware-auth.test.ts`, `seed-load-core.ts`, `seed-load.ts`,
  and `ATTRIBUTION.md`, risking broken public images in prod for zero functional gain.
- **`manifest.ts` with `{spec, itemName, file}`:** rejected post-review — `itemName` has
  no consumer (names live in `seed.ts`), and the glob makes the file list redundant.

## Testing

- Existing e2e suite is the test: all migrated specs pass on the new fixtures
  (`npm run test:e2e` locally — broad UI blast radius). CI's selective mapping runs the
  full suite for this branch (`e2e/**` is in the `broad` filter).
- `photo-serving.test.ts` keeps covering placeholder resolution from `public/onboarding`.
- The label script's coverage is the global-setup output guard (exists + non-trivial
  size) plus every e2e run exercising it end-to-end. No separate unit test.

## Out of scope

- No change to the upload pipeline, photo-serving variants, demo-collection seeding
  behavior, or anything under `public/onboarding/`.
- No per-test-case images — per-spec-file granularity.
