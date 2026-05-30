# UI Implementation Design: Complete Wireframe Audit & Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the detailed implementation plan after this design is approved.

**Goal:** Rebuild all 18 pages to match wireframes exactly while enforcing Next.js idioms throughout.

**Architecture:** Data-first sequence: API foundation → Sorting flows (complex) → Collections/Items (straightforward) → Results/Members (polish)

**Tech Stack:** Next.js App Router, Server Components by default, native fetch(), Drizzle ORM, existing UI components (Button, Input, Badge, Card)

---

## Scope: 4 Implementation Phases

### Phase 1: API Layer Foundation (8 routes)

All routes use Server Actions or native `fetch()` in Server Components (no Client Component data fetching).

**Routes to create/verify:**
- `POST /api/sessions` — Create sort session (goal, scope, timebox)
- `GET /api/sessions/[id]` — Fetch session + decision state
- `POST /api/sessions/[id]/decisions` — Record triage/compare decisions
- `GET /api/preferences/[collectionId]` — Fetch preference state
- `POST /api/sort-results` — Create draft result from decisions
- `PATCH /api/sort-results/[id]/items/[rid]` — Manual rerank
- `POST /api/sort-results/[id]/finalize` — Lock result
- `GET /api/sort-results/[id]/shares/[token]` — Fetch shared result (public)

---

### Phase 2: Sorting Flows - Core Complex Feature (6 pages)

Most complex pages; UI patterns here (progress bars, bucket displays, state machines) inform rest of UI.

**1. Sort Hub** — `/collections/[id]/sort`
- **Current:** Basic page exists
- **Build:** Session cards showing status, decision count, last updated
- **Structure:** Header (breadcrumb, title) → Session list (active + history) → Create button

**2. Session Setup** — `/collections/[id]/sort/new`
- **Build from scratch:** Goal picker + scope + timebox selection
- **Structure:** 
  - GOAL: 4 cards (blue highlight on select) — Discover preference, Quick triage, Find my favorites, Revisit maybes
  - WHICH ITEMS: Scope buttons — All 48, Unsorted 29, Just maybes
  - TIMEBOX: Option buttons — 5 min, 10 min, 20 min, No limit
  - Begin button (right sidebar card)

**3. Resume Session** — `/collections/[id]/sort/[sessionId]/resume`
- **Build from scratch:** Progress banner with session state
- **Structure:**
  - Banner: "Quick triage (in progress)" + progress bar
  - Counters: 11/48 kept, 5 maybe, 3 released, 29 left
  - Buttons: Resume triage, Restart session, Abandon
  - Note: "1 decision already made are events..."

**4. Triage** — `/collections/[id]/sort/[sessionId]/triage`
- **Build from scratch:** Single-item decision card (3 UI variations)
  - Variation A: Button row (Keep, Maybe, Release, Skip) below item
  - Variation B: Tray buttons right side (vertical stack)
  - Variation C: Fast list (rows with 4 buttons per row)
- **Structure:** Item photo (hero), name, metadata → Bucket buttons → Progress tracker (step 1/3)

**5. Compare** — `/collections/[id]/sort/[sessionId]/compare`
- **Build from scratch:** Pairwise comparison flow (2 variations)
  - Variation A: "Which do you reach for more?" — Two item cards side-by-side
  - Variation B: "Compare the line" — Draw the boundary between buckets
- **Structure:** Two item cards with photos, names, current bucket badges → Pick this / Tie / Skip buttons + reason chips

**6. Results Draft** — `/collections/[id]/results/[resultId]`
- **Fix:** List view with reranking UI
- **Add:** Bucket tallies sidebar (Love 6, Like/Useful 14, Meh 6, Donate 3)
- **Add:** "Re-rank manually" button, "Finalize" button
- **Structure:** Ranked list (computed order) + manual override UI (up/down buttons per row)

---

### Phase 3: Collections + Items - Straightforward Features (7 pages)

Reuse patterns from sorting (bucket badges, filters, progress indicators).

**Collections:**

**7. Collections List** — `/collections` (existing, add filters)
- **Add:** Status filter tabs — All / Active / Archived
- **Add:** Curator badges on collection cards (KC, JP initials)
- **Structure:** Tabs → Grid of collection cards (cover + name + item count + last updated + curators)

**8. Create Collection** — `/collections/new` (existing, verify)
- **Verify:** Name input, Description textarea, Cover photo drop zone, Invite curators field (optional)
- **Structure:** Left side form, right side cover preview

**9. Collection Dashboard** — `/collections/[id]` (existing, add stats + banner)
- **Add:** Stats boxes — 48 ITEMS, 19 TRIAGED, 6 LOVE SO FAR, 2 SAVED RESULTS
- **Add:** Active session banner (blue) — "You have a sorting session in progress" + Resume/Discard buttons
- **Add:** Recent activity feed (right sidebar)
- **Structure:** Title → Stats → Session banner → 4 nav cards (Items, Sort, Results, Members) → Activity

**Items:**

**10. Items Grid** — `/collections/[id]/items` (existing, add filters + badges)
- **Add:** Filter tabs — All 48 / Sorted 19 / Unsorted 29 / Love 6
- **Add:** Search bar (search items...)
- **Fix:** Bucket badge display on ItemCard — ●●●● Love style (dots from preferences)
- **Structure:** Tabs → Search → Grid of items with hero photo + name + bucket badge

**11. Item Detail** — `/collections/[id]/items/[itemId]` (existing, polish)
- **Fix:** Large hero photo display (left side)
- **Fix:** Bucket badge with "your current bucket" label
- **Verify:** Metadata display (Brand, Style, Color, Material, Category, Status, Notes)
- **Verify:** Photos strip at bottom with hero flag
- **Structure:** Hero photo + metadata right → Bucket badge → Add photos button → Sort this item button

**12. Item Edit** — `/collections/[id]/items/[itemId]/edit` (existing, verify)
- **Verify:** Grid layout (name full-width; brand/style in 2-col; color/material in 2-col; category/status in 2-col)
- **Verify:** Notes textarea, Cancel/Save buttons

**13. Add Photos** — `/collections/[id]/items/[itemId]/photos` (existing, verify)
- **Verify:** Large drag-drop zone center
- **Verify:** Take photo button + Choose files button
- **Verify:** Photos strip below (with hero flag, delete, status indicators)

---

### Phase 4: Results + Members - Polish (4 pages)

**Results:**

**14. Results List** — `/collections/[id]/results` (existing, verify)
- **Verify:** Draft vs. finalized view (badge: "draft" or date)
- **Verify:** Item count, bucket tallies, finalize/discard actions

**15. Finalize Results** — `/collections/[id]/results/[resultId]/finalize` (new page)
- **Build from scratch:** Name input + visibility toggle
- **Structure:** 
  - NAME THIS RESULT input ("Spring edit 2026")
  - VISIBILITY: Private (selected) / Shareable by link
  - Message: "Finalizing snapshots the current order..."
  - Finalize button

**16. Shared Results** — `/shared/[token]` (existing, verify)
- **Verify:** Public read-only view (no edit/finalize)
- **Verify:** "finalized May 24" date badge
- **Verify:** Bucketed view (items grouped by bucket)

**Members:**

**17. Members & Invitations** — `/collections/[id]/members` (existing, verify)
- **Verify:** Member list with roles (Owner, Co-curator, Photographer)
- **Verify:** Permissions per member (can edit, add items, etc.)
- **Verify:** Pending invitations section (Resend / Revoke buttons)
- **Verify:** Invite new curator form (email input + permission checkboxes)

---

## Wireframe Compliance Strategy

**How we prevent drift:**

| Aspect | Enforcement |
|--------|------------|
| **Layout** | Match wireframe sections (header, breadcrumb, main, sidebar, footer) exactly |
| **Sizing** | 44px minimum tap targets, tablet-first responsive breakpoints |
| **Data display** | Bucket badges (●●●● style), progress bars, stats boxes as shown |
| **Forms** | Inline labels, validation inline, error messages in-place |
| **Navigation** | Breadcrumb trail always top-left, user profile always top-right |

**Per-page checklist:**
- [ ] Breadcrumb trail matches wireframe
- [ ] User profile card (top-right) present
- [ ] Main content structure matches layout exactly
- [ ] All interactive elements 44px+ (tap-friendly)
- [ ] Data fetching in Server Component (no Client-side `fetch()`)
- [ ] Form mutations via API routes (POST/PATCH)
- [ ] Full TypeScript type safety
- [ ] Uses existing UI components or minimal new ones
- [ ] Next.js idioms enforced (Server Components default, Suspense for async)

---

## Next.js Idioms - Mandatory Patterns

**Server Components:**
- Every page component is `async` (fetches in server, not client)
- Props are JSON-serializable (no Date objects, no functions)
- Data fetching uses native `fetch()` with cache strategies:
  - `cache: 'force-cache'` for static data (collections)
  - `cache: 'no-store'` for dynamic data (sessions, preferences)
  - `next: { revalidate: 60 }` for semi-dynamic data

**Client Components:**
- Mark with `"use client"` ONLY for interactive UI (forms, tabs, state)
- Never fetch data in Client Components; receive as props
- Use `useTransition()` for form submissions, not direct API calls

**Forms & Mutations:**
- All POST/PATCH/DELETE go through API routes (`/api/...`)
- Forms use `<form onSubmit>` with native HTML, not external form libraries
- Error handling via error boundary or inline messages

**Suspense:**
- Async Server Components wrapped in `<Suspense>` at page level
- Loading state shows skeleton or placeholder while data loads

---

## Summary: Complete Checklist

**Phase 1:** 8 API routes
**Phase 2:** 6 sorting pages (build 5 new, fix 1)
**Phase 3:** 7 collections/items pages (add features to 5, verify 2)
**Phase 4:** 4 results/members pages (build 1 new, verify 3)

**Total:** ~40 changes across UI + API layer, all matching wireframes + Next.js idioms.

---

## Success Criteria

1. ✅ All 18 pages match wireframe structure (layout, components, data display)
2. ✅ All interactive elements 44px+ (tablet tap-friendly)
3. ✅ All pages follow Next.js idioms (Server Components, no Client data fetching)
4. ✅ All forms use API routes for mutations
5. ✅ Full TypeScript type safety across all pages
6. ✅ Build succeeds, no type errors
7. ✅ Pages render correctly in browser (manual testing)
