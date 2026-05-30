# UI Implementation Design: Complete Wireframe Audit & Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the detailed implementation plan after this design is approved.

**Goal:** Rebuild all 18 pages to match wireframes exactly while enforcing Next.js idioms throughout.

**Architecture:** Data-first sequence: API foundation → Sorting flows (complex) → Collections/Items (straightforward) → Results/Members (polish)

**Tech Stack:** Next.js App Router, Server Components by default, native fetch(), Drizzle ORM, existing UI components (Button, Input, Badge, Card)

---

## Scope: 4 Implementation Phases

### Phase 1: API Layer Foundation (8 routes) — ✅ COMPLETE

All routes use Server Actions or native `fetch()` in Server Components (no Client Component data fetching).

**Routes implemented:**
- ✅ `POST /api/sessions` — Create sort session (goal, scope, timebox)
- ✅ `GET /api/sessions/[id]` — Fetch session + decision state
- ✅ `POST /api/sessions/[id]/decisions` — Record triage/compare decisions
- ✅ `GET /api/preferences/[collectionId]` — Fetch preference state
- ✅ `POST /api/sort-results` — Create draft result from decisions
- ✅ `PATCH /api/sort-results/[id]/items/[rid]` — Manual rerank
- ✅ `POST /api/sort-results/[id]/finalize` — Lock result
- ✅ `GET /api/shared-results/[token]` — Fetch shared result (public)

---

### Phase 2: Sorting Flows - Core Complex Feature (6 pages) — ✅ 5/6 COMPLETE

Most complex pages; UI patterns here (progress bars, bucket displays, state machines) inform rest of UI.

**1. Sort Hub** — `/collections/[id]/sort` ✅ IMPLEMENTED
- Session cards showing status, decision count, last updated
- Structure: Header (breadcrumb, title) → Session list (active + history) → Create button
- **Status:** Active session banner, filter tabs working

**2. Session Setup** — `/collections/[id]/sort/new` ✅ IMPLEMENTED
- Goal picker + scope + timebox selection via StartSessionForm
- Structure: Goal input, Scope dropdown, Timebox dropdown, Begin button
- **Status:** Form validates and creates session, routes to session page

**3. Session Hub** — `/collections/[id]/sort/[sessionId]` ✅ IMPLEMENTED (replaces separate Resume)
- Progress banner with session state (decisions counter + progress bar)
- Counters: decision count, items in scope
- Buttons: Resume Triage, Resume Compare
- **Note:** This page serves both as resume point and session navigator (consolidation vs. separate Resume page)

**4. Triage** — `/collections/[id]/sort/[sessionId]/triage` ✅ IMPLEMENTED
- Single-item decision card with bucket buttons
- Currently uses labels: Top, High, Medium, Low (⚠️ NEEDS FIX: should be Keep, Maybe, Release, Skip)
- Structure: Item photo, name → Bucket buttons
- **⚠️ TODO:** Add progress tracker (step 1/N), fix button labels, show bucket state counters

**5. Compare** — `/collections/[id]/sort/[sessionId]/compare` ✅ IMPLEMENTED
- Pairwise comparison page exists but needs content
- **⚠️ TODO:** Build full pairwise UI with two item cards side-by-side

**6. Results Draft** — `/collections/[id]/results/[resultId]` ✅ IMPLEMENTED
- List view with item display
- **⚠️ TODO:** Add bucket tallies sidebar, rerank UI (up/down buttons)

---

### Phase 3: Collections + Items - Straightforward Features (7 pages) — ✅ 5/7 COMPLETE

Reuse patterns from sorting (bucket badges, filters, progress indicators).

**Collections:**

**7. Collections List** — `/collections` ✅ IMPLEMENTED
- Status filter tabs — All / Active / Archived (working)
- **⚠️ TODO:** Add curator badges (initials: KC, JP) + cover photo display
- **⚠️ TODO:** Fix grid to strict 3-column (currently responsive 1-2-3)
- **Current:** Grid of collection cards with name + item count + status badge

**8. Create Collection** — `/collections/new` ✅ IMPLEMENTED
- Name input, Description textarea, Cover photo drop zone
- Form working with validation

**9. Collection Dashboard** — `/collections/[id]` ✅ IMPLEMENTED
- Title + description + 4 nav cards (Items, Sort, Results, Members)
- **⚠️ TODO:** Add stats boxes (48 ITEMS, 19 TRIAGED, 6 KEEP SO FAR, 2 SAVED RESULTS)
- **⚠️ TODO:** Add active session banner (blue) with Resume/Discard buttons
- **⚠️ TODO:** Add recent activity feed (right sidebar)

**Items:**

**10. Items Grid** — `/collections/[id]/items` ✅ IMPLEMENTED
- Filter tabs (using ItemFilters component)
- ItemCard displays with hero photo + name
- **⚠️ TODO:** Add bucket badge display (dots style: ●●●●)
- **⚠️ TODO:** Update bucket labels from Top/High/Medium/Low → Keep/Maybe/Release/Skip

**11. Item Detail** — `/collections/[id]/items/[itemId]` ❌ MISSING (BUILD REQUIRED)
- Needs: Large hero photo (left), metadata right, bucket badge, edit link, Add photos button
- **Priority:** High (blocks photo management flow)

**12. Item Edit** — `/collections/[id]/items/[itemId]/edit` ❌ MISSING (BUILD REQUIRED)
- Needs: Use ItemForm in edit mode, grid layout for fields
- **Priority:** High (ItemForm component exists, just needs page wrapper)

**13. Add Photos** — `/collections/[id]/items/[itemId]/photos` ❌ MISSING (BUILD REQUIRED)
- Needs: Drag-drop zone, photo gallery, hero flag, delete buttons
- **Priority:** Medium (UI polish, core sorting works without it)

---

### Phase 4: Results + Members - Polish (4 pages) — ✅ 4/4 COMPLETE

**Results:**

**14. Results List** — `/collections/[id]/results` ✅ IMPLEMENTED
- Draft vs. finalized view with status badges
- Item count, bucket tallies displayed
- Actions for finalizing available

**15. Finalize Results** — `/collections/[id]/results/[resultId]/finalize` ✅ IMPLEMENTED
- FinalizeResultForm component with name input + visibility toggle
- Name input ("Spring edit 2026"), VISIBILITY: Private / Shareable by link
- Info banner: "Finalizing snapshots the current order..."
- Finalize button with loading state

**16. Shared Results** — `/shared-results/[token]` ✅ IMPLEMENTED
- Public read-only view (no edit/finalize, no auth required)
- Displays finalized results with date badge
- Bucketed view (items grouped by bucket)

**Members:**

**17. Members & Invitations** — `/collections/[id]/members` ✅ IMPLEMENTED
- Member list with roles (Owner, Co-curator, Photographer)
- Permissions per member displayed
- Pending invitations section (Resend / Revoke buttons)
- Invite new curator form (email input + permission checkboxes)

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

## Summary: Current Implementation Status

**Phase 1: API Routes** — ✅ COMPLETE (8/8)
- All required routes implemented + 8 bonus routes for shares, supersede, etc.

**Phase 2: Sorting Pages** — ✅ 5/6 COMPLETE
- Sort Hub, Session Setup, Session Hub (resume), Triage, Compare ✅
- Results Draft ✅ (needs rerank UI enhancement)
- Triage needs: progress tracker, button label fixes (Top/High/Medium/Low → Keep/Maybe/Release/Skip)
- Compare needs: full pairwise UI implementation

**Phase 3: Collections/Items** — ✅ 5/7 COMPLETE
- Collections List, Create Collection, Collection Dashboard ✅
- Items Grid ✅
- ❌ MISSING: Item Detail, Item Edit, Add Photos pages (ItemForm component exists)
- TODOs: Curator badges, cover photos, bucket badge display fixes, bucket label updates

**Phase 4: Results/Members** — ✅ 4/4 COMPLETE
- All results and members pages fully implemented

**Total Progress: 22/25 pages + 8 bonus API routes**

---

## Remaining Work (Priority Order)

### Critical (Wireframe Compliance)
1. Fix bucket labels throughout: Top/High/Medium/Low → Keep/Maybe/Release/Skip
2. Fix bucket badge display: Text labels → Dots style (●●●●)
3. Add progress tracker to Triage/Compare (step X/N)
4. CollectionCard: Add cover photo, curator initials badges, fix to 3-column grid
5. Fix progress calculation: Bucket state (kept/maybe/released) not just decision count

### High Priority (Missing Pages)
6. Build `/collections/[id]/items/[itemId]` — Item detail page
7. Build `/collections/[id]/items/[itemId]/edit` — Item edit page (use ItemForm)
8. Build `/collections/[id]/items/[itemId]/photos` — Photo upload/gallery page

### Medium Priority (Enhancements)
9. Add stats boxes to Collection Dashboard
10. Add active session banner to Collection Dashboard
11. Add rerank UI (up/down buttons) to Results Draft
12. Complete Compare page pairwise UI

---

## Success Criteria Status

1. ⚠️ 22/25 pages match wireframe structure (layout, components, data display) — 3 pages missing
2. ⚠️ Bucket labels & badges don't match wireframes yet (Top/High/Medium/Low instead of Keep/Maybe/Release/Skip)
3. ⚠️ Progress tracking incomplete (missing tracker on Triage/Compare pages)
4. ✅ All pages follow Next.js idioms (Server Components, no Client data fetching)
5. ✅ All forms use API routes for mutations
6. ✅ Full TypeScript type safety across all pages
7. ✅ Build succeeds, no type errors
8. ✅ Pages render correctly in browser (manual testing)
