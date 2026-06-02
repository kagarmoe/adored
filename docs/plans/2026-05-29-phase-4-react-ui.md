# Phase 4: React UI Components Implementation Plan

## Context

Phases 0-3 are complete: 12 domain services, 12 repositories, 12 database tables, and 40+ API routes all implemented. Phase 4 builds the complete React UI from scratch — all component directories are empty, no component library installed (only Tailwind + CVA). This is a tablet-first, tap-only curatorial sorting app.

## Architecture Decisions

- **Auth**: `next-auth` v4 is installed but the current `src/lib/auth.ts` reads headers (stub). Swap it to `getServerSession(authOptions)`. The exported `requireAuth()` signature must be preserved — all 40+ API handlers call it.
- **Data fetching**: Server Components for all page-level fetches. Client Components for interactive UI (forms, sort session). No SWR/React Query — plain `fetch()` via a typed `api-client.ts` util.
- **Forms**: Native `<form>` + `onSubmit`, Zod validation client-side, no form library.
- **Components**: CVA for all variant-based primitives. No drag interactions — up/down buttons for reordering.

## Build Order

Tasks must run in this order due to dependency chain:

```
Task 1: Auth infrastructure     ← all pages need this
Task 2: UI primitives           ← all feature components need this
Task 3: Layout components       ← all pages need this
Task 4: API client + hooks      ← all client components need this
Task 5: Collections feature     ← leaf feature, no deps on 6-10
Task 6: Items feature           ← leaf feature
Task 7: Sort hub                ← depends on Tasks 5-6 patterns
Task 8: Active sort session     ← most complex, depends on 7
Task 9: Results feature         ← depends on Task 7 patterns
Task 10: Landing + invitation   ← standalone
```

---

## Task 1 — Auth Infrastructure

**Files:**
- Modify: `src/lib/auth.ts` — Replace header stub with `getServerSession(authOptions)`. Keep `requireAuth()` signature unchanged. Export `authOptions`.
- Create: `src/app/api/auth/[...nextauth]/route.ts` — NextAuth v4 handler. Use Google OAuth provider (credentials via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Fallback: Email provider if no Google creds.
- Create: `src/components/layout/SessionProviderWrapper.tsx` — `'use client'` wrapper around `<SessionProvider>` from `next-auth/react`.
- Modify: `src/app/layout.tsx` — Add `<SessionProviderWrapper>` wrapping children. Set `min-h-screen bg-gray-50`.
- Create: `src/app/login/page.tsx` — Server Component. Redirect to `/collections` if session exists, else render sign-in button calling `signIn()`.
- Create: `src/middleware.ts` — NextAuth `withAuth` middleware protecting all routes except `/`, `/login`, `/shared/[token]`, `/api/auth/[...]`.

**Key constraint:** `authOptions` session callback must ensure `session.user.id` is set (NextAuth doesn't include user ID by default — use `jwt` callback to add it from the Google profile sub).

---

## Task 2 — UI Primitives

**All files under `src/components/ui/`:**

- `Button.tsx` — CVA variants: `variant` (primary|secondary|ghost|danger), `size` (sm|md|lg). Heights: sm=36px, md=44px, lg=56px. `fullWidth` prop.
- `Badge.tsx` — CVA for bucket ranks (top=gold, high=blue, medium=amber, low=gray) and status (draft|finalized|active|paused).
- `Card.tsx` — Container with optional padding, border, and `interactive` prop (tap highlight via `active:opacity-75`).
- `Input.tsx` — Labeled input with error state. Uses `forwardRef`. Tablet-scale (h-12 min).
- `Textarea.tsx` — Same as Input but `<textarea>`.
- `Select.tsx` — Native `<select>` styled to match Input.
- `Checkbox.tsx` — 44px tap target, label beside checkbox.
- `LoadingSpinner.tsx` — Animated SVG spinner, size variants.
- `ErrorMessage.tsx` — Red alert box with optional retry callback.
- `EmptyState.tsx` — Centered: icon slot, heading, message, optional action button.
- `ConfirmDialog.tsx` — Modal overlay (fixed inset, backdrop blur). `onConfirm`/`onCancel` callbacks. Danger variant for destructive actions.
- `index.ts` — Barrel export for all above.

**CVA pattern** (copy for all components):
```ts
const buttonVariants = cva("base classes...", {
  variants: { variant: {...}, size: {...} },
  defaultVariants: { variant: "primary", size: "md" }
})
```

---

## Task 3 — Layout Components

**Files under `src/components/layout/`:**

- `AppLayout.tsx` — Client Component. Props: `breadcrumbs: Array<{label, href?}>`, `actions?: ReactNode`, `children`. Renders Header + breadcrumb bar + `<main>`.
- `Header.tsx` — Client Component (uses `useSession()`). Fixed top, full width, z-50. Logo left, user name + sign-out button right.
- `Breadcrumbs.tsx` — Horizontal trail. Links except last item. Mobile-collapsible.
- `PageContainer.tsx` — `max-w-4xl mx-auto px-4 py-6`.
- `SectionHeader.tsx` — `h2` + optional description + right-side actions slot.

---

## Task 4 — API Client + Hooks

**Files:**
- Create: `src/lib/api-client.ts`
  ```ts
  export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>
  export async function apiGet<T>(path: string): Promise<T>
  export async function apiPost<T>(path: string, body: unknown): Promise<T>
  export async function apiPatch<T>(path: string, body: unknown): Promise<T>
  export async function apiDelete(path: string): Promise<void>
  ```
  All throw `ApiError` on non-ok response with `status` and `message`.
- Create: `src/lib/api-error.ts` — `class ApiError extends Error { status: number }`.
- Create: `src/hooks/useCollection.ts` — Fetches `/api/collections/[id]` + membership. Returns `{ collection, membership, loading, error }`.
- Create: `src/hooks/usePermissions.ts` — Pure computation from `CollectionMembership`. Returns derived booleans (`canAddItems`, `canManageCollection`, etc.).

---

## Task 5 — Collections Feature

**Feature components (`src/features/collections/`):**
- `CollectionCard.tsx` — Name, status badge, item count, last updated. Links to `/collections/[id]`.
- `CollectionForm.tsx` — Client. Name + description fields. Create or edit mode. Calls `apiPost` or `apiPatch`. On success: router.push to collection.
- `MemberList.tsx` — Table with member rows: name, permission badges, remove button (if `canManageCollection`).
- `InviteForm.tsx` — Client. Email input + `PermissionCheckboxes`. Calls invitations API.
- `PermissionCheckboxes.tsx` — 8 checkboxes (one per permission flag) with descriptions.

**Pages (Server Components):**
- `src/app/collections/page.tsx` — Fetch `/api/collections`, render CollectionCard list or EmptyState.
- `src/app/collections/new/page.tsx` — Render CollectionForm in create mode.
- `src/app/collections/[id]/page.tsx` — Fetch collection + membership. Dashboard with links to Items/Sort/Results/Members.
- `src/app/collections/[id]/edit/page.tsx` — Fetch collection. CollectionForm in edit mode.
- `src/app/collections/[id]/members/page.tsx` — Fetch members + invitations. MemberList + InviteForm.

---

## Task 6 — Items Feature

**Feature components (`src/features/items/`):**
- `ItemCard.tsx` — Hero photo (or placeholder), name, brand, bucket badge. Links to detail.
- `ItemGrid.tsx` — Responsive grid (`grid-cols-2 md:grid-cols-3`). EmptyState if empty.
- `ItemForm.tsx` — Client. Fields: name, brand, style, color, material, category, notes.
- `PhotoUpload.tsx` — Client. `<input type="file" accept="image/*">` + preview. POST to `/api/items/[id]/photos`.
- `PhotoGallery.tsx` — Photo strip. Hero indicator. Delete button (if `canDeletePhotos`). Hero-set button.

**Pages:**
- `src/app/collections/[id]/items/page.tsx` — Fetch items. ItemGrid + add button.
- `src/app/collections/[id]/items/new/page.tsx` — ItemForm create mode.
- `src/app/collections/[id]/items/[itemId]/page.tsx` — Fetch item + photos. ItemForm edit mode + PhotoGallery.

**Note:** Item photos API route (`/api/items/[id]/photos`) needs to be added in Phase 3 — check if it exists, add if missing.

---

## Task 7 — Sort Hub

**Feature components (`src/features/sessions/`):**
- `SessionCard.tsx` — Goal, status, decision count, date. Links to session or results.
- `CreateSessionForm.tsx` — Client. Goal picker + submit. Redirects to session on create.
- `SessionGoalPicker.tsx` — 4 large card buttons (one per goal). Selected state highlighted.
- `ActiveSessionBanner.tsx` — Warning banner if active session exists. Resume + Abandon buttons.

**Page:**
- `src/app/collections/[id]/sort/page.tsx` — Fetch sessions. ActiveSessionBanner if active. CreateSessionForm. SessionCard history list.

---

## Task 8 — Active Sort Session (Most Complex)

**Feature components (`src/features/sessions/sort/`):**
- `SortSessionManager.tsx` — Client Component. `useReducer` state machine:
  ```ts
  type SortState =
    | { phase: 'loading' }
    | { phase: 'triage'; item: Item }
    | { phase: 'pairwise'; itemA: Item; itemB: Item }
    | { phase: 'submitting' }
    | { phase: 'complete' }
    | { phase: 'error'; message: string }
  ```
  On init: fetch preferences. Items with `confidence === 0` → triage queue. Once exhausted → pairwise mode (random pairs from items near score boundaries).
- `TriageCard.tsx` — Single item display. 4 full-width bucket buttons (h-14 min). POST triage decision.
- `PairwiseCard.tsx` — Two items side by side. A WINS / TIE / B WINS / SKIP buttons. POST pairwise decision.
- `SortProgress.tsx` — Progress bar, "N decided", Pause/Abandon buttons.
- `SessionComplete.tsx` — End screen. "Generate Draft Results" button → POST `/api/sort-results`.

**Page:**
- `src/app/collections/[id]/sort/[sessionId]/page.tsx` — Server Component. Initial session + item count load. Passes to SortSessionManager.

---

## Task 9 — Results Feature

**Feature components (`src/features/results/`):**
- `ResultItemList.tsx` — Ordered list. Draft mode: up/down buttons per row, inline bucket override. Finalized: read-only.
- `ResultItemRow.tsx` — Rank number, name, bucket badge, manual rank indicator (blue if overridden).
- `ResultActions.tsx` — Draft: Finalize button (with ConfirmDialog). Finalized: Share + Supersede buttons.
- `SharePanel.tsx` — Client. Active shares list. Create share form (optional expiry).
- `BucketSection.tsx` — Groups items by bucket for finalized view.

**Pages:**
- `src/app/collections/[id]/results/[resultId]/page.tsx` — Fetch result + result items. Draft: editable list. Finalized: bucketed view + SharePanel.
- `src/app/shared/[token]/page.tsx` — No auth. Fetch `/api/shared-results/[token]`. Public bucketed view with photos.

**Reordering**: Local `useState` array. Up/down swaps positions. Debounced PATCH to `/api/sort-results/[id]/items/[rid]` with new `manualRank`.

---

## Task 10 — Landing + Invitation

**Files:**
- `src/app/page.tsx` — Server. If session → redirect to `/collections`. Else → landing with sign-in button.
- `src/app/invitations/[token]/page.tsx` — Server. Fetch invitation details. Accept button POSTs to `/api/invitations/[token]/accept`. Redirect to collection on success.

---

## Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run build` — successful build
3. Manual smoke test (dev server):
   - Login flow: click sign-in → redirect back → `/collections`
   - Create collection → see it on list
   - Add item with photo → see it in grid with hero photo
   - Start sort session → complete triage → complete pairwise → generate draft
   - Draft result → reorder → finalize → create share → view `/shared/[token]`
   - Accept invitation from email link

## Known Gaps to Address During Implementation

- **Photo upload route**: Verify `/api/items/[id]/photos` exists; create if missing.
- **Auth session user ID**: Add JWT callback in NextAuth config to include user ID.
- **`createDraftResult` server stub**: The results controller has a TODO — may need to complete PreferenceStateService integration before the "Generate Draft" button works end-to-end.
