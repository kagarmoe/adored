# Image Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` tracking.

**Goal:** Make photos load fast and stop shipping full-res originals to small surfaces, via browser caching + on-demand server resize — without dropping `unoptimized` (still required: private blobs + cookie auth).

**Architecture:** A shared `servePhotoFile()` helper owns blob fetch, a variant ETag, `304` short-circuit (app-side, *not* via `@vercel/blob get`'s `ifNoneMatch`), optional `sharp` resize (`?w=` allowlist) with decode-bomb guards, and `Cache-Control: private, max-age=300, must-revalidate`. Both `/file` routes keep their own authz and delegate serving to it. URL helpers append `?w=`; each surface requests its size.

**Tech Stack:** Next.js App Router (Node runtime), `@vercel/blob` `get`, `sharp`, Vitest, Playwright.

## Global Constraints
- Keep `unoptimized` on every `next/image` for `/file` URLs (private blobs + cookie auth; commit 002e71f). Do NOT remove.
- `export const runtime = "nodejs"` on both `/file` routes (sharp is a native addon).
- `servePhotoFile` is called ONLY after a route's authz passes. Never short-circuit `304` before authz.
- Do NOT forward the client `If-None-Match` into `get()`. Compute + compare the variant ETag app-side.
- Resize allowlist `RESIZE_WIDTHS = [160, 320, 640, 1280]`; non-member width → `400`. `RESIZE_MAX_SOURCE_BYTES = 25_000_000`; `limitInputPixels: 24_000_000`.
- 500 path returns a generic body (`{ error: "Image processing failed" }`); never echo `error.message`.
- Per-surface widths: pool tile 320, cards 640, item hero 1280, gallery tile 640, zoom/download original (no `w`).
- Tests must run in CI: unit/component → `gate` (`npm run test:ci`); e2e → `e2e` job.

---

### Task 1: `servePhotoFile` helper + `sharp` (the serving core)

**Files:**
- Create: `src/lib/photo-serving.ts`
- Create: `src/lib/photo-serving.test.ts`
- Modify: `package.json` (add `sharp`)

**Interfaces:**
- Produces: `servePhotoFile(args: { blobKey: string; mimeType: string; photoId: string; updatedAt: Date }, request: Request): Promise<NextResponse>`; consts `RESIZE_WIDTHS`, `RESIZE_MAX_SOURCE_BYTES`.
- Consumes: `get` from `@vercel/blob`, `getBlobAccess` from `@/lib/photos`, `sharp`.

- [ ] **Step 1: Install sharp** — `npm install sharp@0.35.2` (pin). Verify it appears in `package.json` dependencies.

- [ ] **Step 2: Write failing tests** `src/lib/photo-serving.test.ts` (sharp REAL, blob `get` mocked). Use `vi.hoisted` + `vi.mock("@vercel/blob")`. Read a real fixture buffer (`fs.readFileSync("e2e/fixtures/photos/cc0-01.jpg")`); mock `get` to resolve `{ statusCode: 200, stream: new Response(buf).body, blob: { contentType: "image/jpeg", etag: "x", size: buf.byteLength } }` (fresh stream per call). Tests:
  - `no w → passthrough`: `Content-Type: image/jpeg`, `Cache-Control` contains `max-age=300` + `must-revalidate`, `ETag` present; and **`get` was NOT called with an `ifNoneMatch` option** (`expect(mockGet).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ ifNoneMatch: expect.anything() }))`).
  - `w ∈ {160,320,640,1280}` (parametrized) → `Content-Type: image/webp`; decode the body with `sharp(outBuf).metadata()` and assert `width <= w` and output bytes `< buf.byteLength`.
  - `w=999` → `400`; `w=abc` → `400`.
  - source over ceiling → `400`: mock `get` blob `size: 26_000_000` → `400` and `get`'s stream never drained (or assert status only).
  - `If-None-Match === computed ETag` → `304`, null body, and **`get` NOT called** (short-circuit before fetch).
  - ETag carries version: two calls same `photoId`/`w` but `updatedAt` differing by 1000ms → different `ETag` header values.
  - EXIF orient: mock `get` with `fs.readFileSync("e2e/fixtures/photos/IMG_0428.jpeg")`; request `w=320`; `sharp(outBuf).metadata()` orientation is undefined/1 and dims are upright (width<height or matches the de-rotated expectation). If IMG_0428 has no orientation≠1 tag, generate a fixture with `sharp(base).withMetadata({orientation:6})` in a `beforeAll` and assert the output swaps dims.

- [ ] **Step 3: Run tests, verify they fail** — `npx vitest run src/lib/photo-serving.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** `src/lib/photo-serving.ts`:
```ts
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { getBlobAccess } from "@/lib/photos";

export const RESIZE_WIDTHS = [160, 320, 640, 1280] as const;
export const RESIZE_MAX_SOURCE_BYTES = 25_000_000;
const LIMIT_INPUT_PIXELS = 24_000_000;
const CACHE_CONTROL = "private, max-age=300, must-revalidate";

interface ServeArgs {
  blobKey: string;
  mimeType: string;
  photoId: string;
  updatedAt: Date;
}

function variantEtag(photoId: string, w: number | "orig", updatedAt: Date): string {
  return `"${photoId}:${w}:${updatedAt.getTime()}"`;
}

export async function servePhotoFile(
  { blobKey, mimeType, photoId, updatedAt }: ServeArgs,
  request: Request,
): Promise<NextResponse> {
  const wParam = new URL(request.url).searchParams.get("w");
  let width: number | null = null;
  if (wParam !== null) {
    const n = Number(wParam);
    if (!Number.isInteger(n) || !(RESIZE_WIDTHS as readonly number[]).includes(n)) {
      return NextResponse.json({ error: "Unsupported width" }, { status: 400 });
    }
    width = n;
  }

  const etag = variantEtag(photoId, width ?? "orig", updatedAt);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL } });
  }

  try {
    const result = await get(blobKey, { access: getBlobAccess(blobKey) }); // NOTE: no ifNoneMatch — we own the validator
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (width === null) {
      return new NextResponse(result.stream, {
        headers: { "Content-Type": result.blob.contentType || mimeType, "Cache-Control": CACHE_CONTROL, ETag: etag },
      });
    }

    if (result.blob.size != null && result.blob.size > RESIZE_MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    if (buf.byteLength > RESIZE_MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const out = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "truncated" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return new NextResponse(new Uint8Array(out), {
      headers: { "Content-Type": "image/webp", "Cache-Control": CACHE_CONTROL, ETag: etag },
    });
  } catch (error) {
    console.error("servePhotoFile failed", { photoId, width, error });
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests, verify pass** — `npx vitest run src/lib/photo-serving.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git add src/lib/photo-serving.ts src/lib/photo-serving.test.ts package.json package-lock.json && git commit -m "feat(images): servePhotoFile — variant ETag, max-age cache, guarded sharp resize"`

---

### Task 2: URL helpers append `?w=`

**Files:** Modify `src/lib/photos.ts`; Create/extend `src/lib/photos.test.ts`.

**Interfaces:**
- Produces: `getPhotoAssetUrl(collectionId, itemId, photoId, opts?: { w?: number })`, `getPhotoAssetUrlForPhoto(photo, collectionId, opts?: { w?: number })`, `getPoolPhotoAssetUrl(collectionId, photoId, opts?: { w?: number })` — all append `?w=<n>` only when `opts.w` is set.

- [ ] **Step 1: Failing tests** `src/lib/photos.test.ts`: `getPhotoAssetUrl("c","i","p")` → `/api/collections/c/items/i/photos/p/file` (no query); with `{w:640}` → `…/file?w=640`; `getPoolPhotoAssetUrl("c","p",{w:320})` → `…/pool/photos/p/file?w=320`; `getPhotoAssetUrlForPhoto({id:"p",itemId:"i"},"c",{w:1280})` → ends `?w=1280`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — add `opts?: { w?: number }` to the three helpers; build `const q = opts?.w ? \`?w=${opts.w}\` : "";` and append. Keep the `itemId` null throw in `getPhotoAssetUrlForPhoto`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(images): photo URL helpers accept width option"`

---

### Task 3: Item `/file` route delegates to `servePhotoFile`

**Files:** Modify `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts`; **Create** `…/file/route.test.ts` (does not exist today).

- [ ] **Step 1: Create failing route test** with `vi.hoisted` mocks for `@/lib/auth` (`getSession`), `@/lib/db` (`getDb`), `PhotoRepository`, `ItemRepository`, `MembershipRepository`, `CollectionRepository`, and `@/lib/photo-serving` (`servePhotoFile`). Cases: 401 no session; 404 item missing / collection mismatch; 404 photo missing / itemId mismatch; 403 non-member & non-owner; 200 happy → asserts `servePhotoFile` called once with `{ blobKey, mimeType, photoId, updatedAt }` from the photo and the `request`; **403 wins over a matching If-None-Match** (unauthorized caller sending `if-none-match` still gets 403, `servePhotoFile` NOT called).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — add `export const runtime = "nodejs";`; replace the `get(...)`/304/`NextResponse(result.stream...)` block (lines 44-67) with `return servePhotoFile({ blobKey: photo.blobKey, mimeType: photo.mimeType, photoId: photo.id, updatedAt: photo.updatedAt }, request);`. Remove the now-unused `get`/`getBlobAccess` imports. Keep authz exactly. Wrap residual authz in try/catch returning generic `500` (no `error.message`).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(images): item /file route delegates to servePhotoFile (nodejs runtime)"`

---

### Task 4: Pool `/file` route delegates to `servePhotoFile`

**Files:** Modify `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts`; extend `…/file/route.test.ts` (exists; 401 already covered).

- [ ] **Step 1: Add failing tests** to the existing pool route test: 200 happy → `servePhotoFile` called with the photo's `{blobKey,mimeType,photoId,updatedAt}`; unauthorized + matching `if-none-match` → 403, `servePhotoFile` not called. (Keep existing 401/404/403.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — add `runtime="nodejs"`, delegate to `servePhotoFile` (same replacement as Task 3), remove unused imports.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(images): pool /file route delegates to servePhotoFile"`

---

### Task 5: Per-surface widths at every URL-build site + lazy grid images

**Files (modify):** `src/features/items/ItemCard.tsx` (640), `src/features/collections/CollectionCard.tsx` (640 + `loading` not applicable—`fill`; add to others), `src/features/sorting/CompareChoice.tsx` (640), `src/features/results/MostLovedHero.tsx` (640), `src/features/pool/PoolPhotoGrid.tsx` (320, raw `<img>` already `loading=lazy`), `src/features/items/PhotoGallery.tsx` (640), item-detail `…/[itemNumber]/page.tsx` (hero 1280, gallery tiles 640), and page URL builders: `src/app/collections/page.tsx`, `…/items/page.tsx`, `…/results/[resultNumber]/page.tsx` + `…/results/page.tsx`, `…/sort/[sessionNumber]/compare/page.tsx`, `…/sort/[sessionNumber]/triage/page.tsx`.
**Tests:** extend/`create` component tests asserting the width reaches the `src` for the distinct tiers.

**Approach:** width is decided where the URL is built. Pages that build `heroPhotoUrl`/`coverPhotoUrl` pass `{ w: <tier> }` to the helper; components that build their own URLs (`PoolPhotoGrid`, `PhotoGallery`, item-detail page) pass `{ w }` directly. Components receiving a prebuilt URL string need no change.

- [ ] **Step 1: Failing component tests** — `ItemCard.test.tsx`: when given a `heroPhotoUrl` ending `?w=640`, the rendered `img src` contains `w=640` (it already just renders the prop — so assert at the page level instead). Better: add tests at the build sites — e.g. extend `src/app/collections/[id]/items/page.test.tsx` (or create) asserting `getPhotoAssetUrlForPhoto` is called with `{w:640}`; a `PoolPhotoGrid.test.tsx` asserting tiles' `src` contains `w=320`; item-detail page test asserting hero `src` contains `w=1280`. Use the lightest existing test seam per file.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — thread `{ w }` per the file list above. Add `loading="lazy"` to grid `next/image` tiles that are not the hero (gallery tiles, and card images below the fold) — for `fill` images set `loading="lazy"` (drop any `priority` except the item-detail hero).
- [ ] **Step 4: Run, verify pass** — `npx vitest run` for the touched test files.
- [ ] **Step 5: Commit** — `git commit -am "feat(images): request per-surface widths; lazy-load grid tiles"`

---

### Task 6: e2e — per-surface width threading

**Files:** Create `e2e/image-perf.spec.ts`.

- [ ] **Step 1: Write the spec** — seed via fixtures (follow `e2e/sort-images.spec.ts`); intercept `**/photos/**/file*` with `route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" })`. On the items grid, `page.waitForRequest(r => /\/file\?.*w=640/.test(r.url()))`. On the item-detail page, `waitForRequest(/\/file\?.*w=1280/)`. On the pool page (if seeded), `waitForRequest(/\/file\?.*w=320/)`. Assert `getByRole("img").first()` visible.
- [ ] **Step 2: Run** — `npm run test:e2e -- image-perf` (Docker DB via globalSetup). Verify pass.
- [ ] **Step 3: Commit** — `git commit -am "test(e2e): assert per-surface image widths"`

---

## Self-Review notes
- Spec coverage: caching(§1)→T1/T3/T4; resize+guards(§2)→T1; helpers(§3)→T2; per-surface(§3)→T5; dedup(§4)→T1/T3/T4; tests(§Testing)→T1-T6. ✓
- The only un-mocked-cross-layer real test is T1's sharp test (real sharp on a real fixture) — satisfies the testing bar.
- `priority` currently only on item-detail hero — keep it there; everything else `loading="lazy"`.
