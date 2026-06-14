# Plan 4 — Deferred-metadata surfacing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give a person calm, opt-in ways to find and name photo-only items later — a nameless-card cue, a "waiting for a name" filter, and a detail-page "Add a name" affordance — with no counts and no shaming.

**Architecture:** Pure presentational changes + one pure `filterItems` helper. No repo/DB changes — "needs a name" is just `name IS NULL`, filtered in-page like the existing status filter. Governed by `TONE.md` (first-order): invitation, never a nag.

**Tech Stack:** Next.js App Router (Server Components + a client `ItemFilters`), TypeScript, Tailwind (DESIGN.md tokens), Vitest (node + jsdom).

**Design:** [`2026-06-14-bulk-upload-plan-4-deferred-metadata-design.md`](./2026-06-14-bulk-upload-plan-4-deferred-metadata-design.md)

---

## File structure

**New**
- `src/lib/items.test.ts` — unit tests for `filterItems`
- `src/features/items/ItemCard.test.tsx` — nameless-cue test (jsdom)
- `src/features/items/ItemFilters.test.tsx` — toggle + URL-preservation test (jsdom)

**Modified**
- `src/lib/items.ts` — add `filterItems`
- `src/features/items/ItemCard.tsx` — nameless "Add a name" cue
- `src/features/items/ItemFilters.tsx` — "Waiting for a name" toggle, preserves `status`
- `src/app/collections/[id]/items/page.tsx` — read `?unnamed=1`, call `filterItems`, pass `unnamed`
- `src/app/collections/[id]/items/[itemNumber]/page.tsx` — nameless "Add a name" affordance

---

## Task 1: `filterItems` pure helper

**Files:** Modify `src/lib/items.ts` · Test `src/lib/items.test.ts`

- [ ] **Step 1: Failing test** — create `src/lib/items.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filterItems } from "./items";

const mk = (over: Partial<{ name: string | null; status: string | null }>) =>
  ({ id: "i", collectionId: "c", number: 1, name: null, status: "active", ...over }) as any;

describe("filterItems", () => {
  const items = [
    mk({ name: "Bag", status: "active" }),
    mk({ name: null, status: "active" }),
    mk({ name: null, status: "archived" }),
  ];
  it("returns all when status=all and unnamed=false", () => {
    expect(filterItems(items, { status: "all", unnamed: false })).toHaveLength(3);
  });
  it("filters to nameless when unnamed=true", () => {
    const r = filterItems(items, { status: "all", unnamed: true });
    expect(r).toHaveLength(2);
    expect(r.every((i) => !i.name)).toBe(true);
  });
  it("applies status and unnamed together", () => {
    const r = filterItems(items, { status: "active", unnamed: true });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: null, status: "active" });
  });
  it("treats missing status as active", () => {
    const r = filterItems([mk({ name: "x", status: null })], { status: "active", unnamed: false });
    expect(r).toHaveLength(1);
  });
});
```
- [ ] **Step 2: Run → FAIL** `npm run test:ci -- src/lib/items.test.ts` (filterItems not exported).
- [ ] **Step 3: Implement** — append to `src/lib/items.ts`:
```ts
import type { Item } from "@/types";

/** In-page filter for the items grid: by status (all|active|archived|deleted)
 *  and, when unnamed is on, only items that have no name yet. */
export function filterItems(
  items: Item[],
  opts: { status: string; unnamed: boolean },
): Item[] {
  return items.filter((item) => {
    if (opts.status !== "all" && (item.status || "active") !== opts.status) return false;
    if (opts.unnamed && item.name) return false;
    return true;
  });
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(items): filterItems helper (status + unnamed)`

---

## Task 2: Nameless-card "Add a name" cue

**Files:** Modify `src/features/items/ItemCard.tsx` · Test `src/features/items/ItemCard.test.tsx`

- [ ] **Step 1: Failing test** — create `src/features/items/ItemCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "./ItemCard";

const item = (over: any) => ({ id: "i", collectionId: "c", number: 7, name: null, brand: null, status: "active", ...over });

describe("ItemCard nameless cue", () => {
  it("shows a calm 'Add a name' cue for a nameless item", () => {
    render(<ItemCard item={item({ name: null }) as any} collectionId="c" />);
    expect(screen.getByText(/add a name/i)).toBeInTheDocument();
  });
  it("shows the brand (not the cue) for a named item", () => {
    render(<ItemCard item={item({ name: "Bag", brand: "Acme" }) as any} collectionId="c" />);
    expect(screen.queryByText(/add a name/i)).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
```
- [ ] **Step 2: Run → FAIL** `npm run test:ci -- src/features/items/ItemCard.test.tsx`.
- [ ] **Step 3: Implement** — in `ItemCard.tsx`, replace the brand sub-line block with a name-aware version:
```tsx
            {item.name ? (
              item.brand && <p className="text-xs text-ink-soft truncate">{item.brand}</p>
            ) : (
              <p className="text-xs text-ink-soft truncate">Add a name</p>
            )}
```
(Keep everything else — the `<h3>` still shows `itemDisplayName(item)` = `#N` for nameless items; the card remains a single `<Link>` to the detail page, so the cue is an inviting label, not a nested control.)
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(items): calm 'Add a name' cue on nameless cards [purses-b1k]`

---

## Task 3: "Waiting for a name" filter toggle

**Files:** Modify `src/features/items/ItemFilters.tsx` · Test `src/features/items/ItemFilters.test.tsx`

- [ ] **Step 1: Failing test** — create `src/features/items/ItemFilters.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilters } from "./ItemFilters";

function hrefOf(name: RegExp) {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("ItemFilters waiting-for-a-name toggle", () => {
  it("renders the toggle; off by default links to ?unnamed=1 preserving status", () => {
    render(<ItemFilters activeFilter="active" unnamed={false} collectionId="c" />);
    expect(hrefOf(/waiting for a name/i)).toBe("/collections/c/items?status=active&unnamed=1");
  });
  it("when on, the toggle links back to just the status (drops unnamed)", () => {
    render(<ItemFilters activeFilter="active" unnamed={true} collectionId="c" />);
    expect(hrefOf(/waiting for a name/i)).toBe("/collections/c/items?status=active");
  });
  it("status links preserve the unnamed flag", () => {
    render(<ItemFilters activeFilter="all" unnamed={true} collectionId="c" />);
    expect(hrefOf(/^archived$/i)).toBe("/collections/c/items?status=archived&unnamed=1");
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — rewrite `src/features/items/ItemFilters.tsx`:
```tsx
import { Button } from "@/components/ui";
import Link from "next/link";

const filters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "Deleted", value: "deleted" },
] as const;

interface ItemFiltersProps {
  activeFilter: string;
  unnamed: boolean;
  collectionId: string;
}

function itemsUrl(collectionId: string, status: string, unnamed: boolean): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (unnamed) params.set("unnamed", "1");
  const qs = params.toString();
  return `/collections/${collectionId}/items${qs ? `?${qs}` : ""}`;
}

export function ItemFilters({ activeFilter, unnamed, collectionId }: ItemFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <Link key={filter.value} href={itemsUrl(collectionId, filter.value, unnamed)}>
          <Button size="sm" variant={activeFilter === filter.value ? "primary" : "secondary"}>
            {filter.label}
          </Button>
        </Link>
      ))}
      <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
      <Link href={itemsUrl(collectionId, activeFilter, !unnamed)}>
        <Button size="sm" variant={unnamed ? "primary" : "secondary"}>
          Waiting for a name
        </Button>
      </Link>
    </div>
  );
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(items): opt-in 'waiting for a name' filter toggle [purses-b1k]`

---

## Task 4: Wire the filter into the items page

**Files:** Modify `src/app/collections/[id]/items/page.tsx`

- [ ] **Step 1: Implement** — update the page:
  1. Widen the prop type: `searchParams?: { status?: string; unnamed?: string }`.
  2. Import `filterItems` from `@/lib/items`.
  3. Compute `const unnamed = searchParams?.unnamed === "1";`
  4. Replace the inline `filteredItems` status-only logic with `const filteredItems = filterItems(items, { status: activeFilter, unnamed });`
  5. Pass `unnamed={unnamed}` to `<ItemFilters ... />`.
  6. When `unnamed` and `filteredItems.length === 0`, show a gentle EmptyState (no shame), e.g. heading `"Everything has a name"`, message `"Nothing is waiting — name things whenever you like."` Keep the existing status empty-state for the other case.
- [ ] **Step 2: Verify build** `npm run build` — page compiles.
- [ ] **Step 3: Commit** `feat(items): apply the waiting-for-a-name filter on the items page [purses-b1k]`

---

## Task 5: Detail-page "Add a name" affordance

**Files:** Modify `src/app/collections/[id]/items/[itemNumber]/page.tsx`

- [ ] **Step 1: Implement** — in the title block (`<h1>{itemDisplayName(item)}</h1>` …), for a nameless item add a calm, honest affordance that links to the existing edit form. After the `{item.brand && …}` line, add:
```tsx
            {!item.name && (
              <Link
                href={`/collections/${params.id}/items/${item.number}/edit`}
                className="mt-1 inline-block text-ink-soft underline underline-offset-2"
              >
                Add a name
              </Link>
            )}
```
(`Link` is already imported on this page. Named items are unchanged — they show their name. The existing "Edit" button stays.)
- [ ] **Step 2: Verify build** `npm run build`.
- [ ] **Step 3: Commit** `feat(items): nameless detail page invites adding a name [purses-b1k]`

---

## Task 6: Gates, screenshots, PR

- [ ] **Step 1: Gates** — all green: `npm run build` · `npm run test:ci` · `npm run lint` · `npm run auth:verify` · `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`.
- [ ] **Step 2: Adversarial review** — run the `adversarial-review` skill on the diff (UX persona against TONE.md is the key gate here: confirm no counts, no warning styling, invitation-not-nag, person-side copy; QA persona on `filterItems`/cue/toggle coverage).
- [ ] **Step 3: Screenshots (UI change → required)** — light + dark of: the items grid with a nameless card showing the cue, and the "Waiting for a name" filter toggled on. Use the local e2e harness (seed a collection with a named + a nameless item).
- [ ] **Step 4: PR** — update the open Plan-4 PR (#178) / retitle to the feature; embed screenshots; present for review.

---

## Self-review notes
- **Spec coverage:** card cue (Task 2), opt-in filter (Tasks 3–4), detail affordance (Task 5), `name IS NULL` semantics (Task 1). Guided flow deferred (Decision 3) — not built. ✓
- **No repo/DB change** — filter is in-page (matches the status filter); the Craftsman/YAGNI call.
- **TONE:** no counts anywhere; toggle label has no number; cue/affordance are invitations in ink-soft, never error/warning; empty state is gentle.
- **Test honesty:** filter logic unit-tested (`filterItems`), cue + toggle component-tested (real DOM + href assertions); server-component pages verified by build + screenshots.
