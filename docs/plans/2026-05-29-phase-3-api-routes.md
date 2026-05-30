# Phase 3: API Routes Implementation Plan

> **For Claude:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 13 REST API controllers for all PurseInator operations with authorization, validation, and error handling.

**Architecture:** Thin handlers that authorize requests, call services, and return JSON responses. All business logic stays in services.

**Tech Stack:** Next.js App Router, TypeScript, Zod for validation, service layer for logic.

---

## Overview: 13 Controllers

1. **UserController** - User profile endpoints
2. **CollectionController** - Collection CRUD and management
3. **MemberController** - Collection membership and permissions
4. **InvitationController** - Invitations and token acceptance
5. **ItemController** - Item CRUD and management
6. **PhotoController** - Photo upload and management
7. **SessionController** - Sorting session CRUD
8. **DecisionController** - Decision event append-only storage
9. **PreferenceController** - Preference state queries and recalculation
10. **ResultController** - SortResult CRUD and finalization
11. **ResultItemController** - Manual re-ranking of result items
12. **ShareController** - Result sharing and token access
13. **AuthController** - Session and token management (if needed)

Total: ~80 endpoint handlers organized by resource.

---

## Structure

```
src/
  server/
    api/
      [resource]/
        route.ts       # GET, POST for list/create
        [id]/
          route.ts     # GET, PATCH, DELETE for single item
          [action]/
            route.ts   # POST for custom actions
```

---

## Key Patterns

### 1. Request Handler Template

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Database } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // Validate body with Zod
    // Call service with authenticated user context
    // Return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

### 2. Authorization Patterns

- **User must be authenticated**: Check `session?.user?.id`
- **User must be collection member**: Check `CollectionMembership` via `MembershipRepository`
- **User must have permission**: Check specific permission flag on `CollectionMembership`
- **Owner only**: Check `collection.ownerId === userId`

### 3. Validation Pattern

```typescript
const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const { success, data, error } = createSchema.safeParse(body);
if (!success) {
  return NextResponse.json({ error: error.errors }, { status: 400 });
}
```

### 4. Service Injection

- Handlers receive repositories/services from DI container
- Each handler instantiates dependencies (can later use factory pattern)
- Services handle all logic, handlers only coordinate

---

## Task Breakdown: 13 Controllers

### Task 1: UserController

**Files:** `src/server/api/users/route.ts`, `src/server/api/users/me/route.ts`

Endpoints:
- GET `/users/me` - Get current user
- PATCH `/users/me` - Update profile
- DELETE `/users/me` - Soft-delete account

### Task 2: CollectionController

**Files:** `src/server/api/collections/route.ts`, `src/server/api/collections/[id]/route.ts`, `src/server/api/collections/[id]/[action]/route.ts`

Endpoints:
- GET `/collections` - List user's collections
- POST `/collections` - Create collection
- GET `/collections/{id}` - Get collection
- PATCH `/collections/{id}` - Update metadata
- DELETE `/collections/{id}` - Soft-delete
- POST `/collections/{id}/archive` - Archive
- POST `/collections/{id}/restore` - Restore
- POST `/collections/{id}/purge` - Permanently delete

### Task 3: MemberController

**Files:** `src/server/api/collections/[id]/members/route.ts`, `src/server/api/collections/[id]/members/[mid]/route.ts`

Endpoints:
- GET `/collections/{id}/members` - List members
- POST `/collections/{id}/members` - Add member (admin)
- GET `/collections/{id}/members/{mid}` - Get membership
- PATCH `/collections/{id}/members/{mid}` - Update permissions
- DELETE `/collections/{id}/members/{mid}` - Remove member

### Task 4: InvitationController

**Files:** `src/server/api/invitations/route.ts`, `src/server/api/invitations/[id]/route.ts`, `src/server/api/collections/[id]/invitations/route.ts`

Endpoints:
- POST `/collections/{id}/invitations` - Create invitation
- GET `/collections/{id}/invitations` - List invitations
- GET `/invitations/{id}` - Get invitation
- PATCH `/invitations/{id}` - Update permissions before acceptance
- DELETE `/invitations/{id}` - Revoke
- POST `/invitations/{id}/resend` - Resend
- POST `/invitations/{token}/accept` - Accept and create membership

### Task 5: ItemController

**Files:** `src/server/api/items/route.ts`, `src/server/api/items/[id]/route.ts`, `src/server/api/collections/[id]/items/route.ts`

Endpoints:
- GET `/collections/{id}/items` - List items
- POST `/collections/{id}/items` - Create item
- GET `/items/{id}` - Get item with preference
- PATCH `/items/{id}` - Update metadata
- DELETE `/items/{id}` - Soft-delete
- POST `/items/{id}/restore` - Restore
- POST `/items/{id}/purge` - Permanently delete

### Task 6: PhotoController

**Files:** `src/server/api/items/[id]/photos/route.ts`, `src/server/api/items/[id]/photos/[pid]/route.ts`

Endpoints:
- GET `/items/{id}/photos` - List photos
- POST `/items/{id}/photos` - Upload photo
- GET `/items/{id}/photos/{pid}` - Get photo metadata
- PATCH `/items/{id}/photos/{pid}` - Update metadata/hero
- DELETE `/items/{id}/photos/{pid}` - Delete photo and blob

### Task 7: SessionController

**Files:** `src/server/api/sessions/route.ts`, `src/server/api/sessions/[id]/route.ts`, `src/server/api/collections/[id]/sessions/route.ts`

Endpoints:
- GET `/collections/{id}/sessions` - List curator sessions
- POST `/collections/{id}/sessions` - Create session
- GET `/collections/{id}/sessions/active` - Get active session
- GET `/sessions/{id}` - Get session
- PATCH `/sessions/{id}` - Update status (pause, complete, abandon)
- DELETE `/sessions/{id}` - Soft-delete

### Task 8: DecisionController

**Files:** `src/server/api/decision-events/route.ts`, `src/server/api/sessions/[id]/decisions/route.ts`

Endpoints:
- GET `/sessions/{id}/decisions` - List session decisions
- POST `/sessions/{id}/decisions` - Append decision (validate with JSON schema)
- GET `/decision-events/{id}` - Get decision

### Task 9: PreferenceController

**Files:** `src/server/api/collections/[id]/preferences/route.ts`, `src/server/api/collections/[id]/preferences/items/route.ts`

Endpoints:
- GET `/collections/{id}/preferences` - Get summary (curator-private)
- GET `/collections/{id}/preferences/items` - List all preferences
- GET `/collections/{id}/preferences/items/{id}` - Get single preference
- POST `/collections/{id}/preferences/recalculate` - Force recompute
- DELETE `/collections/{id}/preferences` - Clear preferences

### Task 10: ResultController

**Files:** `src/server/api/sort-results/route.ts`, `src/server/api/sort-results/[id]/route.ts`, `src/server/api/sessions/[id]/results/route.ts`

Endpoints:
- GET `/collections/{id}/sort-results` - List curator results
- POST `/sessions/{id}/results/draft` - Create draft from preferences
- GET `/sessions/{id}/results/draft` - Get session draft
- GET `/sort-results/{id}` - Get result
- PATCH `/sort-results/{id}` - Update name/visibility
- DELETE `/sort-results/{id}` - Delete draft
- POST `/sort-results/{id}/finalize` - Finalize to immutable
- POST `/sort-results/{id}/supersede` - Create new draft from finalized

### Task 11: ResultItemController

**Files:** `src/server/api/sort-results/[id]/items/route.ts`, `src/server/api/sort-results/[id]/items/[rid]/route.ts`

Endpoints:
- GET `/sort-results/{id}/items` - List items
- GET `/sort-results/{id}/items/{rid}` - Get result item
- PATCH `/sort-results/{id}/items/{rid}` - Set manual rank/bucket
- POST `/sort-results/{id}/items/{rid}/reset` - Remove override
- DELETE `/sort-results/{id}/items/{rid}` - Remove from result

### Task 12: ShareController

**Files:** `src/server/api/sort-results/[id]/shares/route.ts`, `src/server/api/sort-results/[id]/shares/[sid]/route.ts`, `src/server/api/shared-results/route.ts`

Endpoints:
- GET `/sort-results/{id}/shares` - List shares
- POST `/sort-results/{id}/shares` - Create share token
- GET `/sort-results/{id}/shares/{sid}` - Get share
- PATCH `/sort-results/{id}/shares/{sid}` - Update expiration/status
- DELETE `/sort-results/{id}/shares/{sid}` - Revoke share
- GET `/shared-results/{token}` - View shared result (public, read-only)

### Task 13: Middleware & Error Handling

**Files:** `src/server/api/middleware.ts`, `src/lib/api-errors.ts`

- Error handling wrapper
- Authorization helpers
- Validation utilities
- Status code conventions

---

## Execution Strategy

Execute in dependency order:
1. Task 1-2: UserController, CollectionController (foundational)
2. Task 3-4: MemberController, InvitationController (depends on Collection)
3. Task 5-6: ItemController, PhotoController (depends on Collection)
4. Task 7-8: SessionController, DecisionController (depends on Item/Preference)
5. Task 9-10: PreferenceController, ResultController (depends on Decision)
6. Task 11-12: ResultItemController, ShareController (depends on Result)
7. Task 13: Middleware & utilities (applies to all)

Each task includes: create handler, add validation, add authorization, test with curl/Postman, commit.

---

## Ready to Execute

All service layer complete. All repository layer complete. Ready to build API handlers.
