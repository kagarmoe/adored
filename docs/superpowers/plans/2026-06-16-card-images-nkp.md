# Card Image Rendering (purses-nkp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make item cards render their hero photo on the triage, compare, and results pages, degrading gracefully to the calm initial when a photo is missing or fails to load.

**Architecture:** The three pages already load their items but never load the items' hero photos, so the cards fall back to the initial letter. Each page will batch-load covers via the existing `PhotoRepository.findCoverPhotosByItemIds` and pass a `heroPhotoUrl`/`heroA`/`heroB` built with `getPhotoAssetUrlForPhoto(cover, collection.id)`. A new shared client leaf `CardImage` owns the photo-or-fallback logic (incl. `onError`) so the failure path never shows the browser's broken-image glyph.

**Tech Stack:** Next.js App Router (Server Components), React, `next/image` (`unoptimized`), Drizzle, Vitest + Testing Library, Playwright.

## Global Constraints

- **Image URL collection segment is ALWAYS `collection.id` (the ULID), never `collection.slug`** — a slug 404s the `/file` route (`item.collectionId !== params.id`). The nav `Link`'s `collectionId` prop legitimately stays `slug ?? id`.
- **`next/image` stays `unoptimized`** on `/file` URLs so the browser sends auth cookies (memory: `authenticated-image-api-urls`).
- **TDD:** failing test first, shown RED, then minimal code to green. Every touched route + UI element has a test that runs in `npm run test:ci` (mem: `testing-bar-routes-and-ui`).
- **Branch:** `fix/purses-nkp-card-images` (already created). Feature branch → PR → squash-merge. Never commit to `main`.
- **Comments:** WHY only. TypeScript strict; tests may use `as any` for fixtures per the existing pattern.

---

## File Structure

- **Create** `src/components/ui/CardImage.tsx` — shared client leaf: photo with graceful fallback (no-src OR onError → fallback node).
- **Create** `src/components/ui/CardImage.test.tsx` — unit tests for the three CardImage states.
- **Modify** `src/components/ui/index.ts` — export `CardImage`.
- **Modify** `src/features/items/ItemCard.tsx`, `src/features/results/MostLovedHero.tsx`, `src/features/sorting/CompareChoice.tsx` — render `CardImage` instead of inline `next/image`+fallback.
- **Modify** `src/app/collections/[id]/sort/[sessionId]/triage/page.tsx` — load current item's cover; pass `heroPhotoUrl`.
- **Create** `src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx`.
- **Modify** `src/app/collections/[id]/sort/[sessionId]/compare/page.tsx` — load covers for the pair; pass `heroA`/`heroB`.
- **Create** `src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx`.
- **Modify** `src/app/collections/[id]/results/[resultId]/page.tsx` — batch-load covers; pass `heroPhotoUrl` (with `collection.id`).
- **Create** `src/app/collections/[id]/results/[resultId]/page.test.tsx`.
- **Create** `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.integration.test.ts` — DB-backed authz seam (slug 404 / id 200 / IDOR 403).
- **Modify** `e2e/fixtures/seed.ts` — add `seedTriageScenario`.
- **Create** `e2e/sort-images.spec.ts` — real-browser triage image test (interception).
- **Create** `e2e/fixtures/photos/` CC0 images + `e2e/fixtures/photos/LICENSES.md`.

---

### Task 1: `CardImage` shared client leaf

**Files:**
- Create: `src/components/ui/CardImage.tsx`
- Create: `src/components/ui/CardImage.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Produces: `CardImage({ src?: string; alt: string; fallback: React.ReactNode })` — renders `<Image fill unoptimized>` when `src` is set and hasn't errored; otherwise renders `fallback`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/CardImage.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardImage } from "./CardImage";

describe("CardImage", () => {
  it("renders the photo when src is provided", () => {
    render(<CardImage src="/api/collections/c/items/i/photos/p/file" alt="Bag" fallback={<span>B</span>} />);
    expect(screen.getByRole("img", { name: "Bag" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/i/photos/p/file",
    );
  });

  it("renders the fallback when there is no src", () => {
    render(<CardImage alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });

  it("falls back to the calm initial when the photo fails to load (no broken glyph)", () => {
    render(<CardImage src="/api/collections/c/items/i/photos/p/file" alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "Bag" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/CardImage.test.tsx`
Expected: FAIL — cannot resolve `./CardImage`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ui/CardImage.tsx
"use client";

import { useState } from "react";
import Image from "next/image";

interface CardImageProps {
  /** Authenticated /file URL. Absent => fallback shows. */
  src?: string;
  alt: string;
  /** Shown when there is no photo OR the photo fails to load. */
  fallback: React.ReactNode;
}

// Client leaf: a photo that degrades to the calm fallback (the item's initial)
// when missing or on load error — never the browser's broken-image glyph.
// unoptimized so the browser sends auth cookies to the protected /file route.
export function CardImage({ src, alt, fallback }: CardImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
```

- [ ] **Step 4: Add the barrel export**

Add to `src/components/ui/index.ts`:

```ts
export { CardImage } from "./CardImage";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ui/CardImage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/CardImage.tsx src/components/ui/CardImage.test.tsx src/components/ui/index.ts
git commit -m "feat(purses-nkp): CardImage leaf — photo with graceful fallback"
```

---

### Task 2: Route the three cards through `CardImage`

**Files:**
- Modify: `src/features/items/ItemCard.tsx`
- Modify: `src/features/results/MostLovedHero.tsx`
- Modify: `src/features/sorting/CompareChoice.tsx`

**Interfaces:**
- Consumes: `CardImage` (Task 1). Component public props are unchanged (`heroPhotoUrl` / `heroA` / `heroB`).

- [ ] **Step 1: Run the existing component tests (they must stay green — they pin the happy path)**

Run: `npx vitest run src/features/items/ItemCard.test.tsx src/features/results/MostLovedHero.test.tsx src/features/sorting/CompareChoice.test.tsx`
Expected: PASS (these assert the `<img>` src; they become CardImage regressions).

- [ ] **Step 2: Replace ItemCard's image block**

In `src/features/items/ItemCard.tsx`: remove `import Image from "next/image";`, add `import { CardImage } from "@/components/ui";`. Replace the image `<div>` body (the `{heroPhotoUrl ? <Image .../> : <span .../>}` block) with:

```tsx
<div className={`bg-accent-aqua ${imageClassName} flex items-center justify-center relative overflow-hidden`}>
  <CardImage
    src={heroPhotoUrl}
    alt={itemDisplayName(item)}
    fallback={
      <span className="font-display text-5xl text-ink-soft" aria-hidden>
        {itemInitial(item)}
      </span>
    }
  />
</div>
```

- [ ] **Step 3: Replace MostLovedHero's image block**

In `src/features/results/MostLovedHero.tsx`: remove `import Image from "next/image";`, add `import { CardImage } from "@/components/ui";`. Replace the `{heroPhotoUrl ? <Image .../> : <span .../>}` block (inside the aqua image div) with:

```tsx
<CardImage
  src={heroPhotoUrl}
  alt={itemDisplayName(item)}
  fallback={
    <span className="font-display text-7xl text-ink-soft/70" aria-hidden>
      {itemInitial(item)}
    </span>
  }
/>
```

- [ ] **Step 4: Replace CompareChoice's image block**

In `src/features/sorting/CompareChoice.tsx`: remove `import Image from "next/image";`, add `import { CardImage } from "@/components/ui";`. Replace the `{hero ? <Image .../> : <span .../>}` block with:

```tsx
<CardImage
  src={hero}
  alt={itemDisplayName(item)}
  fallback={
    <span className="font-display text-6xl text-ink-soft" aria-hidden>
      {itemInitial(item)}
    </span>
  }
/>
```

- [ ] **Step 5: Run the component tests + build**

Run: `npx vitest run src/features && npm run build`
Expected: PASS; build succeeds (no unused `Image` import).

- [ ] **Step 6: Commit**

```bash
git add src/features/items/ItemCard.tsx src/features/results/MostLovedHero.tsx src/features/sorting/CompareChoice.tsx
git commit -m "refactor(purses-nkp): cards render via CardImage (onError-safe)"
```

---

### Task 3: Triage page loads + passes the hero photo

**Files:**
- Modify: `src/app/collections/[id]/sort/[sessionId]/triage/page.tsx`
- Create: `src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx`

**Interfaces:**
- Consumes: `PhotoRepository.findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>>`; `getPhotoAssetUrlForPhoto(photo, collectionId): string`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findById: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => prefRepo) }));
// Harmless before Step 3 adds the import (the factory only runs when the page imports it).
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import TriagePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const ITEM = { id: "item_1", collectionId: "coll_01ABCDEF", number: 7, name: "Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([ITEM]);
  sessionRepo.findById.mockResolvedValue({ id: "sess_1", status: "active" });
  prefRepo.findByCollection.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map([["item_1", { id: "photo_1", itemId: "item_1" }]]));
});

describe("TriagePage hero image", () => {
  it("renders the current item's hero image using collection.id (ULID), not the slug", async () => {
    vi.doMock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));
    const ui = await TriagePage({ params: { id: "summer-bags", sessionId: "sess_1" } });
    render(ui);
    const img = await screen.findByRole("img", { name: "Bag" });
    expect(img.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(img.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledWith(["item_1"]);
  });

  it("shows the initial (no img) when the item has no cover", async () => {
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    vi.doMock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));
    const ui = await TriagePage({ params: { id: "summer-bags", sessionId: "sess_1" } });
    render(ui);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
```

> Note: `PhotoRepository` is mocked with `vi.doMock` inside each test because the page currently does not import it; place a top-level `vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }))` alongside the others once Step 3 adds the import, and drop the inline `vi.doMock`. (Either form works; the top-level mock is cleaner after the import exists.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx"`
Expected: FAIL — no `<img>` (page passes no `heroPhotoUrl`).

- [ ] **Step 3: Implement the load in the page**

In `src/app/collections/[id]/sort/[sessionId]/triage/page.tsx`, add imports:

```tsx
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
```

After the existing `const item = items.find(...) || null;` line, add:

```tsx
const photoRepo = new PhotoRepository(db);
const covers = item ? await photoRepo.findCoverPhotosByItemIds([item.id]) : new Map();
const cover = item ? covers.get(item.id) : undefined;
const heroPhotoUrl = cover ? getPhotoAssetUrlForPhoto(cover, collection.id) : undefined;
```

Change the `ItemCard` render to pass it:

```tsx
<ItemCard item={item} collectionId={collection.slug ?? collection.id} heroPhotoUrl={heroPhotoUrl} imageClassName="h-64" />
```

(Replace the inline `vi.doMock` in the test with a top-level `vi.mock` for `PhotoRepository` now that it's imported.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/collections/[id]/sort/[sessionId]/triage/page.tsx" "src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx"
git commit -m "feat(purses-nkp): triage renders item hero photo"
```

---

### Task 4: Compare page loads + passes both hero photos

**Files:**
- Modify: `src/app/collections/[id]/sort/[sessionId]/compare/page.tsx`
- Create: `src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, decisionRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findById: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => prefRepo) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => decisionRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import ComparePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const A = { id: "item_a", collectionId: "coll_01ABCDEF", number: 1, name: "Bag A", brand: null, status: "active" };
const B = { id: "item_b", collectionId: "coll_01ABCDEF", number: 2, name: "Bag B", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([A, B]);
  sessionRepo.findById.mockResolvedValue({ id: "sess_1", status: "active" });
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_a", { id: "pa", itemId: "item_a" }],
      ["item_b", { id: "pb", itemId: "item_b" }],
    ]),
  );
});

describe("ComparePage hero images", () => {
  it("renders both items' hero images using collection.id, batch-loaded once", async () => {
    const ui = await ComparePage({ params: { id: "summer-bags", sessionId: "sess_1" } });
    render(ui);
    const a = await screen.findByRole("img", { name: "Bag A" });
    const b = await screen.findByRole("img", { name: "Bag B" });
    expect(a.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(a.getAttribute("src")).not.toContain("summer-bags");
    expect(b.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx"`
Expected: FAIL — no images (no `heroA`/`heroB`).

- [ ] **Step 3: Implement the load in the page**

In `src/app/collections/[id]/sort/[sessionId]/compare/page.tsx`, add imports:

```tsx
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
```

After `const [itemA, itemB] = pair;`, add:

```tsx
const photoRepo = new PhotoRepository(db);
const covers = await photoRepo.findCoverPhotosByItemIds([itemA.id, itemB.id]);
const coverA = covers.get(itemA.id);
const coverB = covers.get(itemB.id);
const heroA = coverA ? getPhotoAssetUrlForPhoto(coverA, collection.id) : undefined;
const heroB = coverB ? getPhotoAssetUrlForPhoto(coverB, collection.id) : undefined;
```

Pass them to `CompareChoice`:

```tsx
<CompareChoice
  sessionId={params.sessionId}
  itemA={itemA}
  itemB={itemB}
  heroA={heroA}
  heroB={heroB}
  comparisonsMade={comparisonsMade}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/collections/[id]/sort/[sessionId]/compare/page.tsx" "src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx"
git commit -m "feat(purses-nkp): compare renders both hero photos"
```

---

### Task 5: Results page batch-loads + passes hero photos (using collection.id)

**Files:**
- Modify: `src/app/collections/[id]/results/[resultId]/page.tsx`
- Create: `src/app/collections/[id]/results/[resultId]/page.test.tsx`

> **Hazard (Global Constraint):** the results components are passed `collectionId={collection.slug ?? collection.id}` for their nav link. The new image URL must use `collection.id` (available in scope), NOT that slug-or-id prop.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/collections/[id]/results/[resultId]/page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  resultRepo: { findById: vi.fn() },
  resultItemRepo: { findByResult: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  shareRepo: { findByResult: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({ SortResultItemRepository: vi.fn(() => resultItemRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({ SortResultShareRepository: vi.fn(() => shareRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import ResultDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const HERO = { id: "item_hero", collectionId: "coll_01ABCDEF", number: 1, name: "Hero Bag", brand: null, status: "active" };
const REST = { id: "item_rest", collectionId: "coll_01ABCDEF", number: 2, name: "Rest Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  resultRepo.findById.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", name: "My ranking", status: "draft" });
  resultItemRepo.findByResult.mockResolvedValue([
    { id: "ri_1", itemId: "item_hero", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
    { id: "ri_2", itemId: "item_rest", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
  ]);
  itemRepo.findByCollection.mockResolvedValue([HERO, REST]);
  shareRepo.findByResult.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_hero", { id: "ph", itemId: "item_hero" }],
      ["item_rest", { id: "pr", itemId: "item_rest" }],
    ]),
  );
});

describe("ResultDetailPage hero images", () => {
  it("renders hero + ranked images using collection.id, batch-loaded once", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultId: "res_1" } });
    render(ui);
    const hero = await screen.findByRole("img", { name: "Hero Bag" });
    const rest = await screen.findByRole("img", { name: "Rest Bag" });
    expect(hero.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(hero.getAttribute("src")).not.toContain("summer-bags");
    expect(rest.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/results/[resultId]/page.test.tsx"`
Expected: FAIL — no images.

- [ ] **Step 3: Implement the load in the page**

In `src/app/collections/[id]/results/[resultId]/page.tsx`, add imports:

```tsx
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
```

Replace the JSX IIFE block (the `(() => { const ranked = ... })()` between `sortedResultItems.length === 0 ? ... :` and the closing of that ternary) by first computing `ranked` + `covers` in the async body, above the `return (`:

```tsx
const ranked = sortedResultItems
  .map((ri) => ({ ri, item: itemById.get(ri.itemId) }))
  .filter((r): r is { ri: typeof r.ri; item: NonNullable<typeof r.item> } => Boolean(r.item));
const covers = await new PhotoRepository(db).findCoverPhotosByItemIds(ranked.map((r) => r.item.id));
const coverUrl = (itemId: string) => {
  const c = covers.get(itemId);
  return c ? getPhotoAssetUrlForPhoto(c, collection.id) : undefined;
};
```

Then change the ranked render block to use `ranked`/`coverUrl` (no inner IIFE):

```tsx
{sortedResultItems.length === 0 || ranked.length === 0 ? (
  <EmptyState heading="No ranked items yet" message="A little more sorting and your ranking will appear here." />
) : (
  <div className="space-y-8">
    <MostLovedHero
      item={ranked[0].item}
      collectionId={collection.slug ?? collection.id}
      heroPhotoUrl={coverUrl(ranked[0].item.id)}
    />
    {ranked.length > 1 && (
      <div className="space-y-4">
        <h2 className="text-ink">The full ranking</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {ranked.slice(1).map(({ ri, item }) => (
            <ItemCard
              key={ri.id}
              item={item}
              collectionId={collection.slug ?? collection.id}
              heroPhotoUrl={coverUrl(item.id)}
              bucket={ri.manualBucket || ri.computedBucket}
            />
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Run test + build**

Run: `npx vitest run "src/app/collections/[id]/results/[resultId]/page.test.tsx" && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/collections/[id]/results/[resultId]/page.tsx" "src/app/collections/[id]/results/[resultId]/page.test.tsx"
git commit -m "feat(purses-nkp): results renders hero + ranked photos via collection.id"
```

---

### Task 6: DB-backed `/file` authz seam test (slug 404 / id 200 / IDOR 403)

**Files:**
- Create: `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.integration.test.ts`

> Crosses the real DB un-mocked (item/photo/membership/collection queries). Only the auth session and the external Blob `get` are mocked. Gated behind `RUN_DB_TESTS=1` and runs in CI's `db-tests` job. No production code changes — this pins the root-cause invariant + authorization.

- [ ] **Step 1: Write the test**

```ts
// src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.integration.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../../../../../../../../e2e/fixtures/db";
import { seedBaseline } from "../../../../../../../../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const { mockGetSession, mockBlobGet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobGet: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@vercel/blob", () => ({ get: mockBlobGet }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET } from "./route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("GET /file authorization seam (route -> DB)", () => {
  let ownerId: string;
  let collectionId: string;
  let itemId: string;
  let photoId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_file_seam";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'File seam test', 'active', now(), now())
    `);
    const item = await new ItemRepository(db).create({ collectionId });
    itemId = item.id;
    const photo = await new PhotoRepository(db).create({
      itemId, collectionId, blobKey: "k", filename: "k.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: true,
    });
    photoId = photo.id;
    mockBlobGet.mockResolvedValue({ statusCode: 200, stream: "bytes", blob: { contentType: "image/jpeg" } });
  });

  afterAll(async () => { await closeDb(); });

  function req() { return new Request("http://localhost/file"); }

  it("404s when the collection segment is a slug, not the owning ULID", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: "summer-bags", itemId, photoId } });
    expect(res.status).toBe(404);
  });

  it("200s for the owner with the correct collection.id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(200);
  });

  it("403s for a non-member hitting another tenant's collection.id (IDOR)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(403);
  });
});
```

> The relative import depth to `e2e/fixtures` is 10 `../` from the `file/` folder (10 directory levels below the repo root). If the path resolves wrong, run `npx vitest` once and correct the depth.

- [ ] **Step 2: Run with the DB harness to verify it passes (and that 404/403 truly fire)**

Run: `npm run test:db -- src/app/api/collections/\[id\]/items/\[itemId\]/photos/\[photoId\]/file/route.integration.test.ts`
Expected: PASS (3 tests). If `RUN_DB_TESTS` isn't set, the suite skips — `npm run test:db` sets it.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.integration.test.ts"
git commit -m "test(purses-nkp): DB-backed /file authz seam (slug 404 / id 200 / IDOR 403)"
```

---

### Task 7: CC0 test image fixtures

**Files:**
- Create: `e2e/fixtures/photos/*.jpg` (~10 files)
- Create: `e2e/fixtures/photos/LICENSES.md`

> Real-world sourcing step. Choose ~10 images that are unambiguously **Public Domain or CC0** (Wikimedia Commons "Public domain" / "CC0" license tags are the safe source). Handbags/purses where available, generic objects otherwise. Verify each license before committing; drop anything ambiguous. The existing `IMG_0428.jpeg` may stay or be replaced.

- [ ] **Step 1: Source and save ~10 PD/CC0 images** into `e2e/fixtures/photos/` as `cc0-01.jpg` … `cc0-10.jpg` (downscale to ≤ ~1600px to keep the repo light).

- [ ] **Step 2: Write `e2e/fixtures/photos/LICENSES.md`** — one row per file: filename, source URL, license (PD/CC0), author/attribution if the license requests it. Example row format:

```markdown
| File | Source | License | Author |
| --- | --- | --- | --- |
| cc0-01.jpg | https://commons.wikimedia.org/wiki/File:... | CC0 1.0 | N/A |
```

- [ ] **Step 3: Sanity-check** every file opens as a valid JPEG and the count is ~10.

Run: `file e2e/fixtures/photos/*.jpg | grep -c JPEG`
Expected: ≥ 10.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/photos
git commit -m "test(purses-nkp): add ~10 CC0/public-domain image fixtures + LICENSES"
```

---

### Task 8: e2e — real-browser triage image (interception)

**Files:**
- Modify: `e2e/fixtures/seed.ts`
- Create: `e2e/sort-images.spec.ts`

**Interfaces:**
- Produces: `seedTriageScenario(ownerId: string): Promise<{ collectionId: string; slug: string; sessionId: string }>` — seeds a collection (with slug), one item, one hero photo row (placeholder blobKey), and an active sort session, all owned by `ownerId`.

- [ ] **Step 1: Add `seedTriageScenario` to `e2e/fixtures/seed.ts`**

Add imports at the top (alongside existing): `import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";`, `import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";`, `import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";`. Then:

```ts
/**
 * Seed a complete triage scenario owned by `ownerId`: a collection (with slug),
 * one item, one hero photo (placeholder blobKey — the e2e intercepts /file), and
 * an active sort session. Returns the ids the spec needs.
 */
export async function seedTriageScenario(ownerId: string): Promise<{
  collectionId: string;
  slug: string;
  sessionId: string;
}> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = "e2e-triage-bags";
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: "E2E Triage Bags",
    slug,
  });
  const item = await new ItemRepository(db).create({ collectionId });
  await new PhotoRepository(db).create({
    itemId: item.id,
    collectionId,
    blobKey: "e2e-placeholder",
    filename: "e2e-placeholder.jpg",
    mimeType: "image/jpeg",
    fileSize: 1,
    uploadedBy: ownerId,
    isHero: true,
  });
  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  return { collectionId, slug, sessionId: session.id };
}
```

- [ ] **Step 2: Write the e2e spec**

```ts
// e2e/sort-images.spec.ts
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("triage hero image", () => {
  let collectionId: string;
  let slug: string;
  let sessionId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ collectionId, slug, sessionId } = await seedTriageScenario(ownerId));
  });

  test("renders the item's hero photo, requested via the collection ULID", async ({ page }) => {
    // No blob emulator: fulfill the protected /file request with a local fixture.
    await page.route("**/photos/**/file", (route) =>
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );

    const fileRequest = page.waitForRequest(
      (r) => r.url().includes("/file") && r.url().includes(collectionId),
    );
    await page.goto(`/collections/${slug}/sort/${sessionId}/triage`);
    await fileRequest; // the image URL carried collection.id (ULID), not the slug

    await expect(page.getByRole("img").first()).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the e2e spec (desktop project is enough for a fast check)**

Run: `npx playwright test sort-images --project=desktop`
Expected: PASS. (Verify RED first by temporarily stashing Task 3's page change, or trust Task 3's vitest red — note in the PR which.)

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/seed.ts e2e/sort-images.spec.ts
git commit -m "test(purses-nkp): e2e triage hero image via fixture interception"
```

---

### Task 9: Full gate + screenshots

- [ ] **Step 1: Run the full local gate**

Run: `npm run build && npm run test:ci && npm run lint && npm run test:db`
Expected: all green.

- [ ] **Step 2: Capture light+dark screenshots** of triage, compare, and results — **including a populated results grid and a no-photo/unnamed card** (per the spec's UX gate; this is what the design gate judges for the catalog tension). Save for the PR body.

- [ ] **Step 3: Commit any screenshot assets if stored in-repo; otherwise attach to the PR.**

---

## Self-Review

**Spec coverage:** triage (Task 3), compare (Task 4), results + collection.id hazard (Task 5), `findCoverPhotosByItemIds` reuse (Tasks 3–5), broken-image fallback (Tasks 1–2), page-level slug-vs-id guard (Tasks 3–5 assertions), un-mocked `/file` authz seam incl. IDOR (Task 6), CC0 fixtures + LICENSES (Task 7), e2e interception + seeding (Task 8), gate + screenshots incl. results grid & no-photo card (Task 9). Design-gate question on the results grid → surfaced for the `ui-ux-pro-max` gate in Task 9 / PR. **Covered.**

**Placeholder scan:** the only real-world-dependent step is Task 7 image sourcing (procedure + acceptance criteria given, not a code placeholder) and the Task 6 import-depth note (explicit correction instruction). No `TODO`/`TBD`/"add error handling".

**Type consistency:** `findCoverPhotosByItemIds(itemIds) → Map<itemId, Photo>` used identically in Tasks 3–5; `getPhotoAssetUrlForPhoto(photo, collection.id)` consistent; `CardImage({src,alt,fallback})` consistent across Tasks 1–2; `seedTriageScenario` return shape matches its consumer in Task 8.
