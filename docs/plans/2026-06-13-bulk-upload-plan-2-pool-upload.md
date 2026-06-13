# Bulk Upload — Plan 2: Durable Blob Upload → Pool + Pool View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person bulk-select/drop many images into a collection and have each land **directly in Blob and as a durable `photos` row in the collection's pool** (`item_id IS NULL`) with no metadata gate — then see those pooled photos in a collection **pool view**.

**Architecture:** Client uploads bytes **straight to Vercel Blob** via `@vercel/blob/client` `upload()` (no 4.5 MB serverless body cap). A collection-scoped token endpoint implements `handleUpload`: it authenticates + authorizes on the user's request (`onBeforeGenerateToken`), and writes the durable `photos` row on Blob's completion callback (`onUploadCompleted`). The row-write is extracted into a pure seam (`recordPooledPhoto`) so it's unit-testable without Blob's network callback. A pool view (server component) lists `item_id IS NULL` photos and renders the bulk uploader. Grouping pooled photos into items and catalog-number URLs are **Plan 3** (out of scope here).

**Tech Stack:** Next.js App Router, `@vercel/blob` + `@vercel/blob/client`, Drizzle (Neon / local `app_test`), Vitest. Builds on Plan 1's schema (`photos.collectionId`, nullable `photos.itemId`).

**Spec:** `docs/plans/2026-06-10-bulk-upload-pool-design.md`

---

## Prerequisites (verify before Task 1)

- [ ] **Plan 1 is merged to `main`** (migration `0001`: `photos.collection_id`, nullable `photos.item_id`). Confirm: `git log --oneline | grep "pool-ready schema"`.
- [ ] **Prod Neon migrated.** Plan 1 held the prod migration "for merge." Pool uploads write `photos.collection_id` (NOT NULL) and pooled rows — **prod must be migrated before this ships.** Confirm with the owner; if not done: `TRUNCATE photos` then `npm run db:migrate` against the prod `DATABASE_URL`.
- [ ] **`BLOB_READ_WRITE_TOKEN` present** in `.env.local` (confirmed) and in Vercel (Production/Preview).
- [ ] **Local test DB up:** `bash e2e/fixtures/test-db.sh up` (DB tests gated by `RUN_DB_TESTS=1`).

### ⚠️ Local-dev limitation (read before testing)

Vercel Blob's `onUploadCompleted` callback **cannot reach `localhost`** — so in `npm run dev` the durable `photos` row is **not** written after a client upload (the file still lands in Blob). This is expected. Therefore:

- The row-write logic lives in `recordPooledPhoto` (Task 2) and is verified by **unit + DB tests**, not by clicking through localhost.
- The full client→Blob→callback→row path is verified on a **Vercel preview deploy** (Task 7), or locally via a tunnel (`vercel dev` with a public URL / ngrok) if desired.
- Never "fix" a missing local row by calling `onUploadCompleted` logic from the client — that would let the client forge `photos` rows. The callback stays server-only.

---

## File Structure

- `src/server/repositories/PhotoRepository.ts` — add `findPoolByCollection` to the interface.
- `src/server/repositories/implementations/PhotoRepository.ts` — implement `findPoolByCollection`.
- `src/server/photos/recordPooledPhoto.ts` (new) — pure seam: persist one pooled photo. One responsibility, no Blob/Next imports.
- `src/server/photos/recordPooledPhoto.test.ts` (new) — unit test with a fake repo.
- `src/lib/db/pool-schema.test.ts` — add a DB test for `findPoolByCollection`.
- `src/lib/photos.ts` — add `getPoolPhotoAssetUrl`.
- `src/app/api/collections/[id]/pool/upload/route.ts` (new) — `handleUpload` token + completion endpoint.
- `src/app/api/collections/[id]/pool/upload/route.test.ts` (new) — auth/authz guard tests.
- `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts` (new) — serve a pooled photo's bytes.
- `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.test.ts` (new) — guard tests.
- `src/features/pool/PoolUpload.tsx` (new) — client bulk uploader (tap-first; drag-drop additive).
- `src/features/pool/PoolPhotoGrid.tsx` (new) — pooled-photo grid (server-rendered list, client thumbnails).
- `src/app/collections/[id]/pool/page.tsx` (new) — the pool view (server component).
- `src/app/collections/[id]/items/page.tsx` — add an "Add photos" entry linking to the pool.

---

## Task 1: Pool query — `findPoolByCollection` (TDD, DB)

**Files:**
- Modify: `src/server/repositories/PhotoRepository.ts`
- Modify: `src/server/repositories/implementations/PhotoRepository.ts`
- Modify: `src/lib/db/pool-schema.test.ts`

- [ ] **Step 1: Add a failing DB test** inside the `describeDb("pool-ready schema", …)` block in `src/lib/db/pool-schema.test.ts`:

```ts
  it("findPoolByCollection returns only unassigned, non-deleted photos", async () => {
    const { db } = getTestDb();
    const { PhotoRepository } = await import(
      "@/server/repositories/implementations/PhotoRepository"
    );
    const repo = new PhotoRepository(db);

    // an item to attach one photo to (so it is NOT pooled)
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_p1', ${collectionId}, 1, now(), now())`,
    );
    // pooled (item_id NULL)
    await repo.create({
      itemId: null, collectionId, blobKey: "p1", filename: "p1.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false,
    });
    // assigned (NOT pooled)
    await repo.create({
      itemId: "item_p1", collectionId, blobKey: "a1", filename: "a1.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false,
    });
    // pooled but soft-deleted (excluded)
    const deleted = await repo.create({
      itemId: null, collectionId, blobKey: "d1", filename: "d1.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false,
    });
    await repo.softDelete(deleted.id);

    const pool = await repo.findPoolByCollection(collectionId);
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ blobKey: "p1", itemId: null, collectionId });
  });
```

- [ ] **Step 2: Run — RED**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: FAIL — `repo.findPoolByCollection is not a function`.

- [ ] **Step 3: Add to the interface** in `src/server/repositories/PhotoRepository.ts`:

```ts
  findByItem(itemId: string): Promise<Photo[]>;
  findPoolByCollection(collectionId: string): Promise<Photo[]>;
```

- [ ] **Step 4: Implement** in `src/server/repositories/implementations/PhotoRepository.ts`. Add `isNull` is already imported (`eq, and, isNull`). Insert after `findByItem`:

```ts
  async findPoolByCollection(collectionId: string): Promise<Photo[]> {
    const photos = await this.db
      .select()
      .from(photosTable)
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      );
    return photos.map((p) => this.mapToPhoto(p));
  }
```

- [ ] **Step 5: Run — GREEN**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: PASS (all prior + this one).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/PhotoRepository.ts src/server/repositories/implementations/PhotoRepository.ts src/lib/db/pool-schema.test.ts
git commit -m "feat(photos): findPoolByCollection — unassigned photos in a collection"
```

---

## Task 2: The pooled-photo record seam (TDD, unit)

This is the exact logic `onUploadCompleted` will call. Pure (takes a repo), no Blob/Next imports, so it's unit-testable without the network callback.

**Files:**
- Create: `src/server/photos/recordPooledPhoto.ts`
- Create: `src/server/photos/recordPooledPhoto.test.ts`

- [ ] **Step 1: Write the failing unit test** `src/server/photos/recordPooledPhoto.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { recordPooledPhoto } from "./recordPooledPhoto";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

function fakeRepo(): IPhotoRepository {
  return {
    create: vi.fn(async (data) => ({
      id: "photo_x",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...data,
    })),
    findById: vi.fn(),
    findByItem: vi.fn(),
    findPoolByCollection: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    clearHeroPhotos: vi.fn(),
  } as unknown as IPhotoRepository;
}

describe("recordPooledPhoto", () => {
  it("creates a pooled photo (itemId null) with the given collection + blob", async () => {
    const repo = fakeRepo();
    const photo = await recordPooledPhoto(repo, {
      collectionId: "col_1",
      uploadedBy: "user_1",
      blobKey: "https://blob/x.jpg",
      filename: "x.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: null,
      collectionId: "col_1",
      blobKey: "https://blob/x.jpg",
      filename: "x.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
      uploadedBy: "user_1",
      isHero: false,
    });
    expect(photo).toMatchObject({ itemId: null, collectionId: "col_1" });
  });
}
);
```

- [ ] **Step 2: Run — RED**

Run: `npx vitest run src/server/photos/recordPooledPhoto.test.ts`
Expected: FAIL — cannot find module `./recordPooledPhoto`.

- [ ] **Step 3: Implement** `src/server/photos/recordPooledPhoto.ts`:

```ts
import type { Photo } from "@/types";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export interface PooledPhotoInput {
  collectionId: string;
  uploadedBy: string;
  blobKey: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
}

export function recordPooledPhoto(
  photoRepo: IPhotoRepository,
  input: PooledPhotoInput,
): Promise<Photo> {
  return photoRepo.create({
    itemId: null,
    collectionId: input.collectionId,
    blobKey: input.blobKey,
    filename: input.filename,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    uploadedBy: input.uploadedBy,
    isHero: false,
  });
}
```

- [ ] **Step 4: Run — GREEN**

Run: `npx vitest run src/server/photos/recordPooledPhoto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/photos/recordPooledPhoto.ts src/server/photos/recordPooledPhoto.test.ts
git commit -m "feat(photos): recordPooledPhoto seam (durable pool row, unit-tested)"
```

---

## Task 3: Token + completion endpoint (`handleUpload`)

`POST /api/collections/[id]/pool/upload` serves two Blob phases on one URL: token generation (user request, authorize here) and upload completion (Blob callback, write the row).

**Files:**
- Create: `src/app/api/collections/[id]/pool/upload/route.ts`
- Create: `src/app/api/collections/[id]/pool/upload/route.test.ts`

- [ ] **Step 1: Implement the route** `src/app/api/collections/[id]/pool/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { recordPooledPhoto } from "@/server/photos/recordPooledPhoto";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 50_000_000; // client upload bypasses the 4.5MB serverless cap; keep a sane ceiling

async function assertCanAddPhotos(collectionId: string): Promise<string> {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  const db = getDb();
  const membership = await new MembershipRepository(db).findByUser(
    session.user.id,
    collectionId,
  );
  const collection = await new CollectionRepository(db).findById(collectionId);
  if (!collection) {
    throw new Error("Not found");
  }
  const isOwner = collection.ownerId === session.user.id;
  if ((!membership || !membership.canAddPhotos) && !isOwner) {
    throw new Error("Forbidden");
  }
  return session.user.id;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // User request: cookies present → authorize and capture the uploader.
        const uploadedBy = await assertCanAddPhotos(params.id);
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ collectionId: params.id, uploadedBy }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Blob callback: NO session. Trust only the signed tokenPayload.
        if (!tokenPayload) {
          throw new Error("Missing token payload");
        }
        const { collectionId, uploadedBy } = JSON.parse(tokenPayload) as {
          collectionId: string;
          uploadedBy: string;
        };
        await recordPooledPhoto(new PhotoRepository(getDb()), {
          collectionId,
          uploadedBy,
          blobKey: blob.url,
          filename: blob.pathname,
          mimeType: blob.contentType ?? "application/octet-stream",
          fileSize: null, // size is not provided on the completion event
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status =
      message === "Unauthorized" ? 401 :
      message === "Forbidden" ? 403 :
      message === "Not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: Write guard tests** `src/app/api/collections/[id]/pool/upload/route.test.ts` (mirrors the existing photos `route.test.ts` hoisted-mock style). We test the authorization path by stubbing `handleUpload` to invoke `onBeforeGenerateToken`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, mockHandleUpload } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
    mockHandleUpload: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => ({ create: vi.fn() })),
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mockHandleUpload }));

import { POST } from "./route";

function makeReq() {
  return new Request("http://localhost/api/collections/c1/pool/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token" }),
  }) as any;
}

describe("POST /api/collections/[id]/pool/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    // Drive onBeforeGenerateToken so we exercise the real authorize path.
    mockHandleUpload.mockImplementation(async (opts: any) => {
      await opts.onBeforeGenerateToken("photos/x.jpg", null, false);
      return { ok: true };
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("403 when the user cannot add photos and is not owner", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ canAddPhotos: false });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u2" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("passes for the owner and returns the handleUpload response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Run — GREEN**

Run: `npx vitest run "src/app/api/collections/[id]/pool/upload/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/collections/[id]/pool/upload/route.ts" "src/app/api/collections/[id]/pool/upload/route.test.ts"
git commit -m "feat(pool): client-upload token + completion endpoint (authorize on token, write row on callback)"
```

---

## Task 4: Serve pooled photo bytes (collection-scoped file route)

Pool photos have no `itemId`, so the existing item-scoped file route can't serve them. Add a collection-scoped one and a URL helper.

**Files:**
- Modify: `src/lib/photos.ts`
- Create: `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts`
- Create: `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.test.ts`

- [ ] **Step 1: Add the URL helper** to `src/lib/photos.ts`:

```ts
export function getPoolPhotoAssetUrl(collectionId: string, photoId: string): string {
  return `/api/collections/${collectionId}/pool/photos/${photoId}/file`;
}
```

- [ ] **Step 2: Implement the file route** `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts` (mirrors the item file route; authorizes by collection membership; serves only pooled photos of this collection):

```ts
import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { getBlobAccess } from "@/lib/photos";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; photoId: string } },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const photoRepo = new PhotoRepository(db);
  const membershipRepo = new MembershipRepository(db);
  const collectionRepo = new CollectionRepository(db);

  try {
    const photo = await photoRepo.findById(params.photoId);
    // Only this collection's pooled (unassigned) photos are served here.
    if (!photo || photo.collectionId !== params.id || photo.itemId !== null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(session.user.id, params.id);
    const collection = await collectionRepo.findById(params.id);
    const isOwner = collection?.ownerId === session.user.id;
    if (!membership && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await get(photo.blobKey, {
      access: getBlobAccess(photo.blobKey),
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { "Cache-Control": "private, no-cache" },
      });
    }
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || photo.mimeType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Photo fetch failed" },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 3: Write guard tests** `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, mockGet, photoRepo, membershipRepo, collectionRepo } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    mockGet: vi.fn(),
    photoRepo: { findById: vi.fn() },
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@vercel/blob", () => ({ get: mockGet }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => photoRepo),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/file") as any;
}

describe("GET pool photo file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: "BYTES",
      blob: { contentType: "image/jpeg" },
    });
  });

  it("404 when the photo is assigned to an item (not pooled)", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "c1", itemId: "item_1", blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the photo belongs to another collection", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "other", itemId: null, blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("streams a pooled photo for a member", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "c1", itemId: null, blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Run — GREEN**

Run: `npx vitest run "src/app/api/collections/[id]/pool/photos/[photoId]/file/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/photos.ts "src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts" "src/app/api/collections/[id]/pool/photos/[photoId]/file/route.test.ts"
git commit -m "feat(pool): serve pooled photo bytes via collection-scoped file route"
```

---

## Task 5: Bulk uploader client component

Multi-file select (tap-first) + drag-drop drop zone (additive). Reuses the existing client-side HEIC→JPEG conversion. Uploads each file directly to Blob via client `upload()`, with per-file status. No 4.5 MB cap (client upload bypasses the serverless body limit); the token endpoint caps at 50 MB.

**Files:**
- Create: `src/features/pool/PoolUpload.tsx`

- [ ] **Step 1: Extract the HEIC converter so it's shared.** In `src/features/items/PhotoUpload.tsx`, the `convertHeifToJpeg`/`loadImage`/`canvasToJpegBlob` helpers are file-local. Move `convertHeifToJpeg` (and its two helpers) into a new client util and import it from both places to avoid duplication:

Create `src/lib/heic.ts`:

```ts
"use client";

import { buildJpegFileName, MAX_UPLOAD_BYTES } from "@/lib/uploads";

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decode failed"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG conversion failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export async function convertHeifToJpeg(file: File): Promise<File> {
  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let smallestBlob: Blob | null = null;

  while (true) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is unavailable for image conversion");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob;
      }
      if (blob.size <= MAX_UPLOAD_BYTES) {
        return new File([blob], buildJpegFileName(file.name), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
    if (Math.max(width, height) <= 2000) {
      break;
    }
    width *= 0.85;
    height *= 0.85;
  }
  if (!smallestBlob) {
    throw new Error("JPEG conversion failed");
  }
  return new File([smallestBlob], buildJpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
```

Then in `src/features/items/PhotoUpload.tsx`, delete the local `loadImage`/`canvasToJpegBlob`/`convertHeifToJpeg` definitions and `import { convertHeifToJpeg } from "@/lib/heic";`. Verify with `npm run build` after Task 5.

- [ ] **Step 2: Write the uploader** `src/features/pool/PoolUpload.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Button, Card } from "@/components/ui";
import { convertHeifToJpeg } from "@/lib/heic";
import { isHeifFile } from "@/lib/uploads";

interface PoolUploadProps {
  collectionId: string;
}

type FileStatus = "pending" | "preparing" | "uploading" | "done" | "error";

interface TrackedFile {
  key: string;
  name: string;
  status: FileStatus;
  error?: string;
}

export function PoolUpload({ collectionId }: PoolUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<TrackedFile[]>([]);

  const update = (key: string, patch: Partial<TrackedFile>) =>
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const uploadAll = async (selected: File[]) => {
    const images = selected.filter((f) => f.type.startsWith("image/") || isHeifFile(f));
    if (images.length === 0) return;

    setBusy(true);
    const tracked: TrackedFile[] = images.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      status: "pending",
    }));
    setFiles((prev) => [...tracked, ...prev]);

    let anySucceeded = false;
    // Sequential keeps the UI legible and avoids hammering the token endpoint;
    // switch to a small concurrency pool later if needed.
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const t = tracked[i];
      try {
        update(t.key, { status: "preparing" });
        const toUpload = isHeifFile(file) ? await convertHeifToJpeg(file) : file;
        update(t.key, { status: "uploading" });
        await upload(toUpload.name, toUpload, {
          access: "private",
          handleUploadUrl: `/api/collections/${collectionId}/pool/upload`,
          clientPayload: JSON.stringify({ collectionId }),
          contentType: toUpload.type,
        });
        update(t.key, { status: "done" });
        anySucceeded = true;
      } catch (err) {
        update(t.key, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setBusy(false);
    if (anySucceeded) {
      // Pooled rows are written by Blob's completion callback; refresh to show them.
      router.refresh();
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (inputRef.current) inputRef.current.value = "";
    await uploadAll(list);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    await uploadAll(list);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary-soft" : "border-hairline"
        }`}
      >
        <span className="text-4xl">📸</span>
        <p className="mt-2 text-ink">Drop photos here, or</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={onPick}
          className="hidden"
          id="pool-upload-input"
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Adding photos…" : "Select photos"}
        </Button>
        <p className="mt-2 text-sm text-ink-soft">
          Add as many as you like — you can name and group them later.
        </p>
      </div>

      {files.length > 0 && (
        <Card padding="md">
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink-soft">{f.name}</span>
                <span
                  className={
                    f.status === "error"
                      ? "text-error-deep"
                      : f.status === "done"
                        ? "text-success-deep"
                        : "text-ink-soft"
                  }
                >
                  {f.status === "done"
                    ? "added"
                    : f.status === "error"
                      ? (f.error ?? "failed")
                      : f.status === "uploading"
                        ? "uploading…"
                        : f.status === "preparing"
                          ? "preparing…"
                          : "waiting…"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

> **Tone note (TONE.md commitment 4):** the copy is unpressured — "Add as many as you like — you can name and group them later." No counts-remaining, no "incomplete," no nags. Verify the `success-deep` / `primary-soft` / `error-deep` tokens exist in the design system; if a token name differs, use the nearest existing one (do not invent tokens). Check `src/components/ui` and the Tailwind theme.

- [ ] **Step 3: Build to verify the shared converter + component compile**

Run: `DATABASE_URL="postgresql://u:p@localhost:5432/db" AUTH_URL="http://localhost:3000" AUTH_SECRET="dummy-build-secret-at-least-32-characters-long-xx" npm run build`
Expected: `Compiled successfully`. (Fix any token-name mismatches surfaced as class typos by checking the theme — they won't fail the build, so also eyeball the component in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/heic.ts src/features/items/PhotoUpload.tsx src/features/pool/PoolUpload.tsx
git commit -m "feat(pool): bulk uploader — client upload to pool, shared HEIC converter, unpressured copy"
```

---

## Task 6: The pool view

**Files:**
- Create: `src/features/pool/PoolPhotoGrid.tsx`
- Create: `src/app/collections/[id]/pool/page.tsx`

- [ ] **Step 1: Photo grid** `src/features/pool/PoolPhotoGrid.tsx` (client; thumbnails via the collection-scoped file route):

```tsx
"use client";

import { getPoolPhotoAssetUrl } from "@/lib/photos";
import type { Photo } from "@/types";

export function PoolPhotoGrid({
  collectionId,
  photos,
}: {
  collectionId: string;
  photos: Pick<Photo, "id" | "filename">[];
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {photos.map((p) => (
        <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPoolPhotoAssetUrl(collectionId, p.id)}
            alt={p.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}
```

> Verify `bg-surface-sunken` exists; if not, use the nearest neutral surface token from the theme.

- [ ] **Step 2: Pool page** `src/app/collections/[id]/pool/page.tsx` (server component; mirrors the items page's auth/load shape):

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AppLayout } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { PoolUpload } from "@/features/pool/PoolUpload";
import { PoolPhotoGrid } from "@/features/pool/PoolPhotoGrid";

interface PoolPageProps {
  params: { id: string };
}

export default async function PoolPage({ params }: PoolPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await new CollectionRepository(db).findById(params.id);
  if (!collection) {
    redirect("/collections");
  }

  const pool = await new PhotoRepository(db).findPoolByCollection(params.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Add photos" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">Add photos</h1>
          <p className="mt-2 text-ink-soft">
            Get your photos in now — name and group them whenever you like.
          </p>
        </div>

        <PoolUpload collectionId={params.id} />

        {pool.length === 0 ? (
          <EmptyState
            heading="No loose photos yet"
            message="Photos you add here wait for you until you're ready to group them."
          />
        ) : (
          <PoolPhotoGrid
            collectionId={params.id}
            photos={pool.map((p) => ({ id: p.id, filename: p.filename }))}
          />
        )}
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 3: Build**

Run: `DATABASE_URL="postgresql://u:p@localhost:5432/db" AUTH_URL="http://localhost:3000" AUTH_SECRET="dummy-build-secret-at-least-32-characters-long-xx" npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/features/pool/PoolPhotoGrid.tsx "src/app/collections/[id]/pool/page.tsx"
git commit -m "feat(pool): collection pool view — bulk uploader + pooled-photo grid"
```

---

## Task 7: Entry point, gates, manual verification, PR

**Files:**
- Modify: `src/app/collections/[id]/items/page.tsx`

- [ ] **Step 1: Add an "Add photos" entry** next to "Add Item" on the items page. In the header actions `<div>` that contains the `Add Item` link, add before it:

```tsx
          <Link href={`/collections/${params.id}/pool`}>
            <Button variant="secondary">Add photos</Button>
          </Link>
```

(Keep the existing `Add Item` link.) Also add the same link to the empty-state `action` area if helpful — optional; the header link is the durable entry.

- [ ] **Step 2: Full gate**

Run:
```bash
npm run build
npm run test:ci
npm run lint
npm run auth:verify
RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/pool-schema.test.ts src/lib/db/e2e-db.test.ts
```
Expected: all exit 0. (`--no-file-parallelism` avoids the known multi-DB-test deadlock; `test:ci` skips DB tests.)

- [ ] **Step 3: Manual verification on a preview deploy** (localhost can't receive Blob's `onUploadCompleted`):

  - Push the branch; let Vercel build a **preview**.
  - On the preview, open a collection → **Add photos** → select 3–5 images (include a HEIC if possible) → confirm each shows "added".
  - Reload; confirm the pooled photos render in the grid (served via the file route).
  - Confirm a non-member/unauthorized user gets 401/403 from `/pool/upload` (and cannot see the pool).
  - Screenshot the pool view (light + dark) for the PR (UI PRs include screenshots).

- [ ] **Step 4: PR**

```bash
git push -u origin feat/bulk-upload-pool
gh pr create --title "feat(pool): durable bulk upload → photo pool + pool view (bulk upload 2/4)" --body "Implements docs/plans/2026-06-13-bulk-upload-plan-2-pool-upload.md. Client uploads straight to Blob (no 4.5MB cap); a collection-scoped handleUpload endpoint authorizes on token-gen and writes a durable pooled photos row (item_id NULL) on Blob's completion callback (verified on preview — localhost can't receive the callback). Pool view lists unassigned photos. Grouping into items + catalog-number URLs are Plan 3. Part of purses-b1k. Screenshots: light + dark."
```

---

## Self-Review

- **Spec coverage (Plan 2 slice = "Get photos in"):** durable Blob-client bulk upload (Tasks 3, 5) → pool rows via crash-safe completion callback (Tasks 2, 3) → pool view (Task 6) → pool query (Task 1) → pool photo serving (Task 4) → entry point (Task 7). Grouping, deferred-metadata surfacing, and catalog-number URLs are explicitly **Plan 3+**.
- **Crash-safety:** the file is durable in Blob the instant it uploads; the `photos` row is written by the one server completion step (`recordPooledPhoto`). File-confirmed-then-row → the two can't desync; the pool is always rebuildable from the DB.
- **Security:** authorize in `onBeforeGenerateToken` (user request, has session); `onUploadCompleted` trusts only the signed `tokenPayload` (no session on the Blob callback) — the client can't forge an uploader or collection. The pool file route serves only this collection's `item_id IS NULL` photos to members.
- **TDD:** pool query (DB red→green, Task 1), record seam (unit red→green, Task 2), both routes (guard tests, Tasks 3–4). The Blob callback path itself is verified on preview (documented limitation).
- **Type consistency:** `findPoolByCollection(collectionId): Promise<Photo[]>` identical in interface + impl + tests; `recordPooledPhoto(photoRepo, input)` and `PooledPhotoInput` identical across seam + endpoint; `getPoolPhotoAssetUrl(collectionId, photoId)` identical across helper + grid.
- **Placeholder scan:** all steps carry concrete code/commands. The only "verify the token name" notes (design-system classes) are deliberate guardrails against inventing tokens, not deferred work.
- **TONE:** unpressured copy throughout ("add as many as you like… later"); no counts/incomplete/nags; tap-first with drag as an additive aid; no swiping.
- **Deferred (Plan 1 decision, still in force):** `Item.name` stays non-null in the type; nameless-item display (catalog-number based) lands with grouping (Plan 3). Not touched here.
```
