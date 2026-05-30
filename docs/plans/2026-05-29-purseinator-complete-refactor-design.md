# PurseInator Complete Refactor Design
**Date:** 2026-05-29  
**Scope:** Full MVP implementation with service-first architecture  
**Status:** Design approved, ready for implementation planning

---

## 1. Architecture & Philosophy

**Core Principle:** DecisionEvents are immutable, append-only source of truth. All other state is derived from them.

### Separation of Concerns

- **Domain Services** contain all business logic and are persistence-agnostic. They reason about collections, items, decisions, scores—not database tables.
- **Repositories** handle persistence via Drizzle ORM. Services call repositories through abstract interfaces.
- **API Handlers** are thin—they authorize requests, call services, format responses.
- **React Components** call APIs and render UI. No business logic in React.

### Lazy Computation Strategy

Preferences, scores, and sorted rankings are computed on-demand when:
- A curator views results
- The pairing algorithm needs to select next items
- A curator generates a draft SortResult

This keeps the data model simple and DecisionEvents truly authoritative.

### Authorization

Every mutation is authorized server-side by checking `CollectionMembership` permissions. Client-side checks are UI convenience only—never trusted.

---

## 2. Service Layer Design

### UserService
- Get current user profile (`/users/me`)
- Update user profile (PATCH `/users/me`)
- Soft-delete user account (DELETE `/users/me`)

### CollectionService
- Create, read, update collections
- Archive and restore collections
- Soft-delete collections (owner only)
- Purge collections with confirmation (owner only)
- Manage collection memberships (add, update permissions, remove)
- Own invitation creation and management

### InvitationService
- Create, read, update invitations (scoped to collection)
- Resend invitations
- Accept invitations (creates CollectionMembership)
- Revoke invitations

### ItemService
- Create, read, update items within a collection
- Soft-delete and restore items
- Purge items (permanent delete + blob cleanup)
- Photo CRUD (attach, update, delete photos)

### SessionService
- Create and manage sorting sessions (one active per curator per collection)
- Pause, resume, complete, abandon sessions
- Generate session item scope based on goal and collection state

### DecisionEventService
- Append DecisionEvents (immutable, never update/delete)
- Query events by session
- Types: `triage` (result: top|high|medium|low), `pairwise_compare` (result: item_a|item_b|tie|skip)

### ScoringService
- `computePreferences(collectionId, curatorId)` → all items with scores and confidence
- `computeItemPreference(itemId, curatorId)` → single item preference
- Lazy-computed from DecisionEvents
- Scoring model: triage assigns base score (top=100, high=75, medium=50, low=25), pairwise wins/losses adjust score, confidence tracks comparison count

### PairingService
- `selectNextPair(sessionId)` → returns two items to compare
- Prioritize in order:
  1. Unseen items
  2. Lightly judged items (few comparisons)
  3. Items near important boundaries (top/high, medium/low)
  4. Items with close scores
  5. Top-tier items (refine favorites)
  6. Items with low confidence (ambiguous)
- Avoid over-comparing confidently low items

### PreferenceStateService
- `recalculatePreferences(collectionId)` → force recompute all curator preferences
- `clearPreferences(collectionId)` → clear derived state for current curator
- Get preference summary, item list, single item preference

### SortResultService
- Generate draft SortResult from computed preferences
- Store manual overrides (rank/bucket) on SortResultItems
- Finalize results (immutable snapshot)
- Supersede finalized results (creates new draft without modifying original DecisionEvents)
- CRUD for SortResultItems with override support

### SortResultShareService
- Create, read, update, delete shares
- Generate public share tokens
- Expose only finalized result and photos, never DecisionEvents or scores
- Public read-only viewing via share token

---

## 3. Data Model & Schema

### Core Tables

**users**
- id, email, name, created_at, updated_at, deleted_at

**collections**
- id, owner_id (user), name, description, status (active|archived|deleted), created_at, updated_at, deleted_at

**collection_memberships**
- id, collection_id, user_id, permissions (8 boolean flags), created_at, updated_at
- UNIQUE(collection_id, user_id)

**invitations**
- id, collection_id, email, token, permissions (8 boolean flags), status (pending|accepted|revoked), created_at, updated_at, accepted_at

### Content Tables

**items**
- id, collection_id, name, brand, style, color, material, category, status, notes, created_at, updated_at, deleted_at

**photos**
- id, item_id, blob_key, filename, mime_type, file_size, uploaded_by (user), is_hero (boolean), created_at, updated_at, deleted_at

### Curator Work Tables

**sessions**
- id, collection_id, curator_id (user), status (active|paused|completed|abandoned|deleted), goal, created_at, updated_at
- UNIQUE(collection_id, curator_id) WHERE status='active'

**decision_events**
- id, session_id, type (triage|pairwise_compare), decision (json), created_at
- Immutable, append-only

**collection_preference_items** (ephemeral, computed)
- id, collection_id, curator_id, item_id, score, confidence, rank_bucket, comparison_count, last_seen, updated_at

### Results Tables

**sort_results**
- id, collection_id, curator_id, status (draft|finalized), name, created_at, updated_at, finalized_at

**sort_result_items**
- id, sort_result_id, item_id, computed_rank, computed_bucket, manual_rank, manual_bucket, created_at, updated_at

**sort_result_shares**
- id, sort_result_id, share_token, status (active|revoked), expires_at, created_at, updated_at

### Key Constraints

- One active session per curator per collection: `UNIQUE(collection_id, curator_id) WHERE status='active'`
- DecisionEvents immutable (no update/delete)
- CollectionPreferenceItems ephemeral (can be cleared/recalculated)
- SortResults: drafts editable, finalized immutable
- Collections: owner required, private by default
- Photos: soft-delete supported, blob cleanup on purge

---

## 4. Authorization Model

**Core Rule:** Every mutation checks permissions server-side. Client-side checks are UI convenience only.

### Permission Model

Permissions live on `CollectionMembership`, not on `User`.

Eight granular flags:
- `can_manage_collection` — update collection metadata, archive/restore
- `can_invite_members` — create and manage invitations
- `can_add_items` — create items
- `can_edit_metadata` — update shared item fields
- `can_add_photos` — upload photos
- `can_delete_photos` — delete photos
- `can_sort` — create sessions and DecisionEvents
- `can_view_outputs` — view finalized results and shares

Owner gets all permissions by default.

### Authorization Rules by Operation

| Operation | Permission | Additional Rules |
|-----------|-----------|-----------------|
| Update collection metadata | `can_manage_collection` | |
| Archive/restore collection | owner OR `can_manage_collection` | |
| Soft-delete collection | owner only | |
| Purge collection | owner only | requires `{ "confirm": "PURGE" }` |
| Create/manage invitations | `can_invite_members` | collection-scoped |
| Add/update/remove members | `can_manage_collection` OR owner | |
| Accept invitation | authenticated user (email match) | creates membership |
| Create/update items | `can_add_items` | shared metadata |
| Delete/restore items | `can_add_items` | soft operations |
| Purge items | owner OR `can_manage_collection` | blob cleanup required |
| Upload photos | `can_add_photos` | |
| Delete photos | `can_delete_photos` | |
| Create/update sessions | `can_sort` | one active per curator per collection |
| Create DecisionEvents | `can_sort` + active session | |
| View preferences/results | `can_view_outputs` + curator_id match OR shared | |
| Create/finalize results | `can_view_outputs` + curator_id match | curator-private by default |
| Share results | `can_view_outputs` + curator_id match | finalized only |
| View shared result | share token OR membership + share access | public or authenticated |

### Private Curator Data

Visible only to the curator who created them, or users explicitly shared with:
- Sessions (one active per curator)
- DecisionEvents (curator's own decisions only)
- Draft SortResults
- Manual overrides
- Preference state

### Shared Data Visibility

Visible to any collection member:
- Collection metadata
- Items and photos
- Member list (if member has view permission)
- Pending invitations (if member has invite permission)

---

## 5. Key Implementation Decisions

### Scoring Model

**Approach:** Simple, replaceable, confidence-aware

- **Triage events** assign base score by bucket: top=100, high=75, medium=50, low=25
- **Pairwise comparisons** adjust score: winner +5, loser -5 (conservative, incremental)
- **Confidence** is comparison count (0 = no direct comparison, increases with pairwise)
- **Bucket assignment** derived from score thresholds: top≥90, high≥70, medium≥50, low<50
- **Recalculation:** Lazy (on-demand when preferences viewed or pairing algo runs)

**Rationale:** DecisionEvents immutable means we can rescore retroactively if algorithm improves. Simple model validates core architecture quickly.

### Preference Computation (Lazy)

- `computePreferences(collectionId, curatorId)` iterates all DecisionEvents for curator in that collection
- Builds in-memory score map from triage and pairwise events
- Computes buckets from score thresholds
- Returns full preference state for all items
- Each curator sees only their own preferences (private by default)

**Rationale:** Lazy avoids cache invalidation and keeps computation clear. DecisionEvents remain the single source of truth.

### Pairing Algorithm

**Base priority order for pair selection:**
1. **Unseen items** — show for first time
2. **Lightly judged items** — shown a few times but not thoroughly compared (low comparison_count)
3. **Items near important boundaries** — score near top/high threshold (87-93) or medium/low threshold (47-53)
4. **Items with close scores** — hard to disambiguate, need comparison (score diff ≤ 10)
5. **Top-tier items** — refine high-scoring items (score ≥ 85)
6. **Items with low confidence** — ambiguous, uncertain items (confidence < 3)

**Avoid:** Over-comparing items already confidently low (score < 50 AND confidence ≥ 5)

**Goal-Driven Priority Reordering:**

Pairing priorities shift based on session goal. The curator chooses a goal when creating/resuming a session.

| Session Goal | Priority Order | Rationale |
|---|---|---|
| **Quick triage** (get initial judgments fast) | [1, 3, 2, 4, 6, 5] | Unseen and boundaries first, skip refinement |
| **Find favorites** (identify top tier) | [5, 1, 4, 3, 2, 6] | Top items and close scores, refine top tier, avoid low items |
| **Compare top items** (stabilize top tier) | [5, 4, 3, 1, 2, 6] | Prioritize top-tier refinement and disambiguation |
| **Revisit undecided** (reduce ambiguity) | [6, 3, 4, 2, 1, 5] | Low-confidence and boundaries, skip already-decided items |

**Implementation notes:**
- Default goal if not specified: "Quick triage"
- Goals may be selected per-session or overridable mid-session
- Pairing service receives sessionGoal parameter and reorders priorities accordingly

### Session Item Scope

SessionService generates the initial item list for a session based on curator goal and collection state. This list can be refined/filtered during session.

**Item scope filtering rules by goal:**

| Session Goal | Item Selection | Filter | Max Items | Rationale |
|---|---|---|---|---|
| **Quick triage** | All unseen + unranked | Exclude items already triaged | Collection size | Get broad coverage fast |
| **Find favorites** | High-confidence high-tier | Score ≥ 70 OR unseen | Up to 50 items | Focus on favorites, avoid definite rejects |
| **Compare top items** | High-scoring items | Score ≥ 80 OR confidence = 1 (new high-scorers) | Up to 20 items | Refine top tier, skip medium/low |
| **Revisit undecided** | Low-confidence items | Confidence < 3 (few comparisons) | Up to 30 items | Reduce ambiguity in close items |

**Generation logic:**
1. Curator selects goal when creating session
2. SessionService filters collection items by goal rules
3. If fewer than min items available, expand filter (e.g., "quick triage" with <5 unseen → include all unseen + unranked)
4. Order items for presentation:
   - "Quick triage": unseen first, then by creation date
   - "Find favorites": by score descending
   - "Compare top items": by score descending
   - "Revisit undecided": by confidence ascending (least confident first)

**Note:** Curator may start a session and later request a different goal, which regenerates the item list.

### Draft SortResult Generation & Lifecycle

**When drafts are created:**
- Curator requests a draft via POST `/sessions/{sessionId}/results/draft`
- SortResultService computes preferences from all DecisionEvents for this curator in this collection
- Service generates a new draft SortResult with computed rank/bucket for each item
- If a draft already exists for this session, it is replaced (only one draft per session)

**Draft result state:**
- **Computed fields:** rank, bucket (derived from preferences at generation time)
- **Editable overrides:** manualRank, manualBucket (optional, per-item)
- **Display logic:** show manual override if set, else computed value
- **Reset option:** curator can clear manual overrides and revert to computed values

**Draft to finalize workflow:**
1. Curator views draft result (shows all items with computed/manual ranks)
2. Curator optionally edits manual overrides (reorder, change buckets)
3. Curator reviews final output and taps "Finalize"
4. POST `/sort-results/{draftId}/finalize` creates immutable snapshot
5. Draft is archived; curator cannot edit finalized result

**Finalized result immutability:**
- Finalized results cannot be edited or deleted (only superseded)
- Curator can view finalized results in history
- Curator can supersede to create new draft based on this finalized result
- POST `/sort-results/{finalizedId}/supersede` creates new draft with copied rank/bucket (no manual overrides)

**Manual override semantics:**
- Override persists only on draft; reverts if curator abandons or closes session
- If curator finalizes, overrides are baked into the finalized snapshot
- If curator supersedes, overrides are NOT copied to new draft (start fresh)

---

## 6. UI & Interaction Principles

### Tablet-First, Tap-Only

- Large tap targets (minimum 44×44px)
- No swipe, drag-and-drop, or precision gestures as primary interactions
- Buttons for all actions (not hidden under gestures)
- Clear, visible progress indicators
- Low-pressure session pacing

### Form-First Data Entry

- Photo upload uses standard browser file input (not custom drag-only)
- Item metadata uses form fields with clear labels
- Decisions are button-based:
  - Triage: tap top/high/medium/low buttons
  - Compare: tap A / B / tie / skip buttons
- Single-item-at-a-time triage screen (considered judgment, low cognitive load)

### Session Pacing

- One item at a time for triage
- Comparison pairs presented clearly side-by-side
- Progress visible (e.g., "19 of 48 decided")
- Easy pause/resume/abandon

### Result Review

- Finalized results show rank and bucket clearly
- Manual re-rank uses move controls (up/down buttons, not drag)
- Confidence summaries show score stability
- Finalized results are read-only after publication

### Navigation

- Clear breadcrumbs and back buttons
- Jump links from collection dashboard (Items, Sort, Results, Members)
- Consistent top navigation

### Invitation Paths

- **Path 1 (creation):** Create collection → invite curators in form → create
- **Path 2 (after creation):** Open collection → Members → invite → send invitations
- Both paths supported for user convenience

---

## Architectural Decisions Validated Against Spec

✅ DecisionEvents as source of truth (immutable, append-only)  
✅ Lazy computation of preferences and scores  
✅ Permission-based authorization (not role-based)  
✅ Owner-only delete/purge with confirmation  
✅ Tap-first, tablet-optimized UI  
✅ One-item-at-a-time triage screen  
✅ Scoring with confidence tracking  
✅ Pairing algorithm prioritizes meaningful comparisons  
✅ Shared data / private judgment split  
✅ Service-first domain logic  

---

## Next Steps

Implementation planning via superpowers:writing-plans skill. Recommended approach:

1. **Layer 1: Domain Services** — implement logic without persistence
2. **Layer 2: Persistence** — schema + repository implementations
3. **Layer 3: API Routes** — handlers with authorization
4. **Layer 4: React Components** — UI with tap-friendly interactions
5. **Layer 5: Infrastructure** — auth, blob storage, validation

Build all features across each layer before moving to the next.
