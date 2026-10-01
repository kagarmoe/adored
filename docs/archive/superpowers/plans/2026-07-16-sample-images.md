# Unified Sample-Image System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home all e2e test images under `e2e/fixtures/sample-images/` with per-spec labeled variants generated at test-setup time, so a failing test's screenshot identifies its spec; delete the three legacy fixture sets.

**Architecture:** Committed base photos (`base/<spec>.webp`, one per spec) are stamped with their spec name by a sharp script into gitignored `labeled/`, invoked from the existing Playwright `global-setup.ts`. Specs serve these via `route.fulfill` (nothing uploads). Demo images at `public/onboarding/` are untouched. Unit-test byte fixtures (jpeg + EXIF-orientation jpeg) are regenerated with sharp at the same dimensions so `photo-serving.test.ts` assertions hold.

**Tech Stack:** Playwright, sharp ^0.35.2 (already a dependency), Node built-ins only (no new deps).

**Spec:** `docs/superpowers/specs/2026-07-16-sample-images-design.md` (rev 2, approved 2026-07-16).

## Global Constraints

- Never commit to `main`; all work on branch `kg/e2e-images`.
- Demo images and everything under `public/onboarding/` are out of scope — do not touch.
- No new npm dependencies. Use `node:fs` readdir, not a glob package.
- The label script must not call `.withMetadata()` (sharp's default strips source metadata — that is required behavior).
- The working tree already contains unstaged deletions of `e2e/fixtures/photos/` and `e2e/fixtures/demo-images/` — do NOT restore them; they are staged in Task 6.
- The full e2e suite is expected to be red until Task 5 completes (fixtures are already deleted from disk). Unit tests (`npm run test:ci`) are red until Task 4. Do not "fix" this by restoring files.
- The 18 interim base photos created in Task 2 are placeholders; the owner replaces them file-for-file with generated photos (same filenames) — no code change on swap.

**The 18 spec basenames** (used for base photo names, labels, and prompts — `<spec>` below always means one of these):

```
a11y  compare  decision-recovery  delete-photo  image-perf  image-rotate
item-page  not-mine-set-aside  not-yet-defer  results  results-onward
results-rerank  session-create-after-set-aside  session-pause  session-undo
sort-images  sort-session  usage-round
```

---

### Task 1: Image-generation prompts doc

**Files:**
- Create: `docs/test-image-prompts.md`

**Interfaces:**
- Produces: filenames `e2e/fixtures/sample-images/base/<spec>.webp` the owner will drop in (consumed by Task 3's script).

- [ ] **Step 1: Write the doc**

Create `docs/test-image-prompts.md` with exactly this structure — a shared style block, then one prompt per spec. Use this shared block verbatim and write one object line per spec (vary the object; keep each to one sentence):

```markdown
# Test-image generation prompts

One image per e2e spec, dropped into `e2e/fixtures/sample-images/base/<spec>.webp`
(exact filenames below). Landscape, ~1200×900, webp. Interim placeholders exist —
replacing a file with the same name is the whole swap.

## Shared style (prepend to every prompt)

> A single household object, centered, on a clean pale-neutral background.
> Dominant color palette: saturated red, orange, and yellow tones. Modern
> editorial product photography, soft daylight, minimal props, Dwell-magazine
> aesthetic. Landscape orientation. No people, no text, no watermarks.

## Per-spec prompts

| File | Object |
|---|---|
| `a11y.webp` | A tomato-red rotary telephone |
| `compare.webp` | Two nesting terracotta bowls, side by side |
| `decision-recovery.webp` | An amber glass carafe |
| `delete-photo.webp` | A burnt-orange envelope tray |
| `image-perf.webp` | A yellow mechanical kitchen timer |
| `image-rotate.webp` | A rust-colored desk fan |
| `item-page.webp` | A marigold ceramic table lamp |
| `not-mine-set-aside.webp` | A coral storage basket |
| `not-yet-defer.webp` | An orange-spined hardcover book |
| `results.webp` | A red enamel dutch oven |
| `results-onward.webp` | A saffron throw blanket, folded |
| `results-rerank.webp` | A vermilion ceramic vase |
| `session-create-after-set-aside.webp` | A honey-yellow wall hook rack |
| `session-pause.webp` | A persimmon teapot |
| `session-undo.webp` | A scarlet alarm clock |
| `sort-images.webp` | A tangerine desk lamp |
| `sort-session.webp` | A goldenrod woven floor cushion |
| `usage-round.webp` | A cherry-red hand mixer |
```

- [ ] **Step 2: Commit**

```bash
git add docs/test-image-prompts.md
git commit -m "docs: add per-spec test-image generation prompts"
```

---

### Task 2: Scaffold sample-images home with interim base photos

**Files:**
- Create: `e2e/fixtures/sample-images/base/<spec>.webp` (18 files, generated interim)
- Modify: `.gitignore` (append one line)

**Interfaces:**
- Produces: `e2e/fixtures/sample-images/base/*.webp` (read by Task 3's script); gitignored `e2e/fixtures/sample-images/labeled/`.

- [ ] **Step 1: Generate 18 interim warm-toned base photos**

Run exactly (sharp is installed; heredoc avoids quoting issues):

```bash
node - <<'EOF'
const sharp = require("sharp");
const { mkdirSync } = require("node:fs");
const specs = ["a11y","compare","decision-recovery","delete-photo","image-perf",
  "image-rotate","item-page","not-mine-set-aside","not-yet-defer","results",
  "results-onward","results-rerank","session-create-after-set-aside",
  "session-pause","session-undo","sort-images","sort-session","usage-round"];
const warm = [[196,63,40],[224,122,47],[233,169,41],[176,46,55],[209,90,33],[228,148,64]];
mkdirSync("e2e/fixtures/sample-images/base", { recursive: true });
(async () => {
  for (const [i, s] of specs.entries()) {
    const [r, g, b] = warm[i % warm.length];
    await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r, g, b } } })
      .webp({ quality: 80 })
      .toFile(`e2e/fixtures/sample-images/base/${s}.webp`);
  }
  console.log("done:", specs.length);
})();
EOF
```

Expected output: `done: 18`

- [ ] **Step 2: Verify**

Run: `ls e2e/fixtures/sample-images/base | wc -l`
Expected: `18`

- [ ] **Step 3: Gitignore the labeled output dir**

Append to `.gitignore`:

```gitignore

# derived per-spec labeled test images — regenerated by e2e global-setup
/e2e/fixtures/sample-images/labeled/
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore e2e/fixtures/sample-images/base
git commit -m "test: scaffold e2e sample-images home with interim base photos"
```

---

### Task 3: Label script + global-setup wiring

**Files:**
- Create: `scripts/label-test-images.mjs`
- Modify: `e2e/global-setup.ts`

**Interfaces:**
- Consumes: `e2e/fixtures/sample-images/base/*.webp` (Task 2).
- Produces: `e2e/fixtures/sample-images/labeled/<spec>.webp` for every base file — the paths Task 5's specs reference. Script exits non-zero if base/ is empty or any output is missing/undersized (that exit failing the Playwright run IS the output guard from the spec).

- [ ] **Step 1: Write the script**

Create `scripts/label-test-images.mjs`:

```js
// Stamps each e2e base photo with its spec name so a failure screenshot
// identifies the spec that produced it. Run by e2e/global-setup.ts; safe to
// run manually: node scripts/label-test-images.mjs
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

const ROOT = join(process.cwd(), "e2e", "fixtures", "sample-images");
const BASE = join(ROOT, "base");
const OUT = join(ROOT, "labeled");
const MIN_BYTES = 1024;

const files = readdirSync(BASE).filter((f) => f.endsWith(".webp"));
if (files.length === 0) throw new Error(`no base images in ${BASE}`);
mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const spec = basename(file, ".webp");
  const src = sharp(join(BASE, file));
  const { width = 1200, height = 900 } = await src.metadata();
  const bar = Math.max(48, Math.round(height * 0.12));
  const fontSize = Math.round(bar * 0.45);
  const svg = `<svg width="${width}" height="${height}">
    <rect x="0" y="${height - bar}" width="${width}" height="${bar}" fill="#3a1208" opacity="0.9"/>
    <text x="${width / 2}" y="${height - bar / 2}" font-family="Helvetica, Arial, sans-serif"
      font-size="${fontSize}" font-weight="bold" fill="#ffffff"
      text-anchor="middle" dominant-baseline="central">${spec}</text>
  </svg>`;
  // no .withMetadata(): sharp's default output strips any source EXIF/XMP
  await src.composite([{ input: Buffer.from(svg) }]).webp({ quality: 80 }).toFile(join(OUT, file));
}

for (const file of files) {
  const size = statSync(join(OUT, file)).size;
  if (size < MIN_BYTES) throw new Error(`labeled output too small: ${file} (${size}B)`);
}
console.log(`labeled ${files.length} test images -> ${OUT}`);
```

- [ ] **Step 2: Run it and verify success output**

Run: `node scripts/label-test-images.mjs`
Expected: `labeled 18 test images -> …/e2e/fixtures/sample-images/labeled`

Run: `ls e2e/fixtures/sample-images/labeled | wc -l`
Expected: `18`

- [ ] **Step 3: Prove the guard fails loudly**

```bash
mv e2e/fixtures/sample-images/base e2e/fixtures/sample-images/base.bak
mkdir e2e/fixtures/sample-images/base
node scripts/label-test-images.mjs; echo "exit=$?"
rmdir e2e/fixtures/sample-images/base
mv e2e/fixtures/sample-images/base.bak e2e/fixtures/sample-images/base
```

Expected: thrown `Error: no base images in …` and `exit=1`.

- [ ] **Step 4: Append to global-setup**

Modify `e2e/global-setup.ts` — the whole file becomes:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export default async function globalSetup() {
  const script = path.resolve(process.cwd(), "e2e/fixtures/test-db.sh");
  await execFileAsync("bash", [script, "up"], {
    cwd: process.cwd(),
    env: process.env,
  });
  // Regenerate per-spec labeled test images; a non-zero exit (missing/undersized
  // output) fails the whole run loudly — specs never assert on pixels themselves.
  await execFileAsync("node", ["scripts/label-test-images.mjs"], {
    cwd: process.cwd(),
    env: process.env,
  });
}
```

- [ ] **Step 5: Verify global-setup end-to-end**

```bash
rm -rf e2e/fixtures/sample-images/labeled
npx playwright test e2e/profile.spec.ts --project=tablet
ls e2e/fixtures/sample-images/labeled | wc -l
```

Expected: the spec passes (it doesn't use photo fixtures), and `18` labeled files exist — proving global-setup ran the script. (Most other specs are still red until Task 5; that's expected.)

- [ ] **Step 6: Commit**

```bash
git add scripts/label-test-images.mjs e2e/global-setup.ts
git commit -m "test: generate per-spec labeled images in e2e global-setup"
```

---

### Task 4: Unit fixtures + photo-serving migration

**Files:**
- Create: `e2e/fixtures/sample-images/unit/plain-1600x973.jpg`, `e2e/fixtures/sample-images/unit/exif-orient6-4032x3024.jpg` (generated, committed)
- Modify: `src/lib/photo-serving.ts:67-70`, `src/lib/photo-serving.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (independent).
- Produces: `DEMO_IMAGE_DIRS` with a single entry; unit fixtures under `sample-images/unit/` (jpg — never touched by the label script, which reads only `base/*.webp`).

- [ ] **Step 1: Generate replacement unit fixtures (same dims as the deleted originals, so no assertion changes)**

```bash
node - <<'EOF'
const sharp = require("sharp");
const { mkdirSync } = require("node:fs");
mkdirSync("e2e/fixtures/sample-images/unit", { recursive: true });
(async () => {
  await sharp({ create: { width: 1600, height: 973, channels: 3, background: { r: 214, g: 106, b: 60 } } })
    .jpeg({ quality: 70 }).toFile("e2e/fixtures/sample-images/unit/plain-1600x973.jpg");
  await sharp({ create: { width: 4032, height: 3024, channels: 3, background: { r: 222, g: 140, b: 66 } } })
    .jpeg({ quality: 70 }).withMetadata({ orientation: 6 })
    .toFile("e2e/fixtures/sample-images/unit/exif-orient6-4032x3024.jpg");
  const meta = await sharp("e2e/fixtures/sample-images/unit/exif-orient6-4032x3024.jpg").metadata();
  console.log("orientation:", meta.orientation, "dims:", meta.width, "x", meta.height);
})();
EOF
```

Expected: `orientation: 6 dims: 4032 x 3024`

- [ ] **Step 2: Repoint the test file's fixtures**

In `src/lib/photo-serving.test.ts`:

Change the fixture helper path (line ~19):
```ts
// old
  fs.readFileSync(path.join(process.cwd(), "e2e/fixtures/photos", name));
// new
  fs.readFileSync(path.join(process.cwd(), "e2e/fixtures/sample-images/unit", name));
```

Change the two fixture constants (lines ~20-21):
```ts
const cc0 = fixture("plain-1600x973.jpg"); // 1600x973, no EXIF orientation
const exifPhoto = fixture("exif-orient6-4032x3024.jpg"); // 4032x3024, EXIF orientation 6 (portrait)
```

Change the demo-fallback block (lines ~194-199) — `demoArgs` repoints from the
deleted `demo-images/accessories-01.webp` to an onboarding file (both dirs served
the same code path; coverage is preserved):
```ts
const demoArgs = { ...baseArgs, blobKey: "demo-seed-placeholder/copper-tea-kettle.webp" };
const localBytes = () =>
  fs.readFileSync(path.join(process.cwd(), "public/onboarding/copper-tea-kettle.webp"));
```
(`onboardingArgs`/`onboardingBytes` just below already point at
`public/onboarding/blue-mixing-bowl.webp` — leave them.)

- [ ] **Step 3: Shrink the search-path array**

In `src/lib/photo-serving.ts:67-70`:

```ts
// old
const DEMO_IMAGE_DIRS = [
  join(process.cwd(), "public", "onboarding"),
  join(process.cwd(), "e2e", "fixtures", "demo-images"),
];
// new
const DEMO_IMAGE_DIRS = [join(process.cwd(), "public", "onboarding")];
```

- [ ] **Step 4: Run the unit suite**

Run: `npx vitest run src/lib/photo-serving.test.ts`
Expected: PASS, all tests (previously ENOENT-red on this branch).

Run: `npm run test:ci`
Expected: PASS — nothing else read the deleted fixtures; if anything fails on a fixture path, fix it the same way, don't restore files.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/sample-images/unit src/lib/photo-serving.ts src/lib/photo-serving.test.ts
git commit -m "test: regenerate unit photo fixtures; drop demo-images search path"
```

---

### Task 5: Migrate the 18 specs + screenshot harness

**Files:**
- Modify (fixture path + `contentType: "image/webp"` in the same file):
  - `e2e/a11y.spec.ts:23` (const `FIXTURE`)
  - `e2e/compare.spec.ts:12`, `e2e/decision-recovery.spec.ts:32`, `e2e/not-mine-set-aside.spec.ts:28`, `e2e/not-yet-defer.spec.ts:26`, `e2e/results-onward.spec.ts:28`, `e2e/results-rerank.spec.ts:20`, `e2e/results.spec.ts:23`, `e2e/session-create-after-set-aside.spec.ts:37`, `e2e/session-pause.spec.ts:25`, `e2e/session-undo.spec.ts:23`, `e2e/sort-session.spec.ts:19`, `e2e/usage-round.spec.ts:37` (const `PHOTO_FIXTURE`)
  - `e2e/delete-photo.spec.ts:17`, `e2e/image-perf.spec.ts:16`, `e2e/image-rotate.spec.ts:17`, `e2e/item-page.spec.ts:33`, `e2e/sort-images.spec.ts:18` (inline `route.fulfill`)
  - `e2e/screenshots/capture.ts:26` (demo image — see Step 2)

**Interfaces:**
- Consumes: `e2e/fixtures/sample-images/labeled/<spec>.webp` (Task 3).

- [ ] **Step 1: Repoint every spec to its own labeled image**

Pattern — each spec file uses ITS OWN basename. Exemplar for `e2e/sort-images.spec.ts:17-19`:

```ts
// old
    await page.route("**/api/photo-files/**", (route) =>
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );
// new
    await page.route("**/api/photo-files/**", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/sort-images.webp", contentType: "image/webp" }),
    );
```

Exemplar for a const-style spec, `e2e/results.spec.ts:23`:

```ts
// old
const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-03.jpg";
// new
const PHOTO_FIXTURE = "e2e/fixtures/sample-images/labeled/results.webp";
```

In every migrated file, also change any `contentType: "image/jpeg"` used with that fixture to `contentType: "image/webp"` (grep the file; some pass the const into multiple `route.fulfill` calls).

- [ ] **Step 2: Screenshot harness uses a demo image**

`e2e/screenshots/capture.ts:25-26`:

```ts
// old
// A real photo so the shots show a real rendered image, not a placeholder.
const FIXTURE = "e2e/fixtures/photos/IMG_0428.jpeg";
// new
// A real photo so the shots show a real rendered image, not a labeled test card.
const FIXTURE = "public/onboarding/blue-mixing-bowl.webp";
```

Also switch its `contentType` to `"image/webp"` wherever `FIXTURE` is fulfilled in that file.

- [ ] **Step 3: Verify no stragglers**

Run: `grep -rn "fixtures/photos\|fixtures/demo-images" e2e src scripts --include="*.ts" --include="*.tsx" --include="*.mjs"`
Expected: no matches.

- [ ] **Step 4: Run the full e2e suite locally (broad blast radius)**

Run: `npm run test:e2e`
Expected: PASS. If a spec fails on image assertions, debug with systematic-debugging — do not skip it.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test: serve per-spec labeled sample images in e2e specs"
```

---

### Task 6: Delete legacy fixtures and run all gates

**Files:**
- Delete: `e2e/fixtures/photos/` (already gone from disk — stage it), `e2e/fixtures/demo-images/` (same), `scripts/fetch-demo-images.mjs`

- [ ] **Step 1: Stage deletions**

```bash
git rm -r --quiet e2e/fixtures/photos e2e/fixtures/demo-images
git rm --quiet scripts/fetch-demo-images.mjs
```

(Working tree already lacks the first two; `git rm` stages the deletion either way.)

- [ ] **Step 2: Check nothing references the deleted script**

Run: `grep -rn "fetch-demo-images" package.json .github docs README.md --include="*" | grep -v superpowers`
Expected: no matches outside historical plan/spec docs. If `package.json` or CI references it, remove that reference in this task.

- [ ] **Step 3: Full local gates (per CLAUDE.md pre-PR verification)**

```bash
npm run lint
npm run test:ci
npm run build
npm run test:e2e
```

Expected: all PASS. Record the exact commands + results for the PR body.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: remove legacy e2e photo fixtures and fetch script"
```

---

## Post-plan (not tasks, workflow gates)

- Whole-branch adversarial review (per-diff personas), then `/sync-docs`, `/graphify --update`, PR with gate evidence and screenshots if any UI surface changed (none expected — test-only).
- Owner replaces interim base photos file-for-file using `docs/test-image-prompts.md`
  (binary-only commit, before or after merge; filenames are the contract).
