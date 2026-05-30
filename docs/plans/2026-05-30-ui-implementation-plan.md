# UI Implementation Plan: Complete Wireframe Audit + Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild all 17 pages + 8 API routes to match wireframes exactly while enforcing Next.js idioms throughout.

**Architecture:** Data-first sequence (API → Sorting → Collections/Items → Results/Members). Each task is 2-5 minutes, one logical change per commit. Frequent verification (build, type check, manual browser test).

**Tech Stack:** Next.js App Router, Server Components (async by default), native `fetch()`, Drizzle ORM, existing UI components (Button, Input, Badge, Card, etc.)

---

## Phase 1: API Routes Foundation (8 tasks)

APIs must exist before sorting UI can work. Each route handles a specific domain action.

### Task 1: Create Sessions API Route

**Files:**
- Create: `src/app/api/sessions/route.ts`

**Steps:**

1. Create route handler for POST `/api/sessions` that accepts `{ collectionId, goal, scope, timebox }` and creates a Session record

```typescript
// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  const db = getDb();

  const [newSession] = await db.insert(sessionsTable).values({
    id: generateId("session"),
    collectionId,
    curatorId: session.user.id,
    goal,
    status: "active",
  }).returning();

  return NextResponse.json(newSession, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get("collectionId");
  const db = getDb();

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
  return NextResponse.json(sessions);
}
```

2. Verify TypeScript compiles: `npm run build 2>&1 | head -20` (should show no errors in this file)

3. Test with curl:
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"collectionId":"col_123","goal":"Discover preference"}'
```

Expected: 201 with session object

4. Commit

```bash
git add src/app/api/sessions/route.ts
git commit -m "feat: create sessions API route (POST/GET)"
```

---

### Task 2: Create Decision Events API Route

**Files:**
- Create: `src/app/api/sessions/[id]/decisions/route.ts`

**Steps:**

1. Create route handler for POST `/api/sessions/[id]/decisions` that records triage/compare decisions

```typescript
// src/app/api/sessions/[id]/decisions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";

interface DecisionRequest {
  sessionId: string;
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, any>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: DecisionRequest = await req.json();
  const db = getDb();

  const [event] = await db.insert(decisionEventsTable).values({
    id: generateId("event"),
    sessionId: params.id,
    type: body.type,
    decision: body.decision,
  }).returning();

  return NextResponse.json(event, { status: 201 });
}
```

2. Verify TypeScript compiles: `npm run build 2>&1 | head -20`

3. Test with curl:
```bash
curl -X POST http://localhost:3000/api/sessions/sess_123/decisions \
  -H "Content-Type: application/json" \
  -d '{"type":"triage","decision":{"itemId":"item_1","bucket":"Love"}}'
```

Expected: 201 with decision event object

4. Commit

```bash
git add src/app/api/sessions/[id]/decisions/route.ts
git commit -m "feat: create decision events API route (POST)"
```

---

### Task 3: Create Sort Results API Route

**Files:**
- Create: `src/app/api/sort-results/route.ts`

**Steps:**

1. Create route handler for POST `/api/sort-results` that creates a draft SortResult from session decisions

```typescript
// src/app/api/sort-results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";

interface CreateResultRequest {
  sessionId: string;
  collectionId: string;
  name: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: CreateResultRequest = await req.json();
  const db = getDb();

  const [result] = await db.insert(sortResultsTable).values({
    id: generateId("result"),
    collectionId: body.collectionId,
    curatorId: session.user.id,
    status: "draft",
    name: body.name,
  }).returning();

  return NextResponse.json(result, { status: 201 });
}
```

2. Verify TypeScript compiles: `npm run build 2>&1 | head -20`

3. Test with curl:
```bash
curl -X POST http://localhost:3000/api/sort-results \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_123","collectionId":"col_123","name":"Spring edit"}'
```

Expected: 201 with result object

4. Commit

```bash
git add src/app/api/sort-results/route.ts
git commit -m "feat: create sort results API route (POST)"
```

---

### Tasks 4-8: Remaining API Routes

Follow the same pattern for:

- Task 4: `PATCH /api/sort-results/[id]/items/[rid]` — Manual rerank
- Task 5: `POST /api/sort-results/[id]/finalize` — Lock result
- Task 6: `GET /api/sort-results/[id]/shares/[token]` — Fetch shared result (public)
- Task 7: `GET /api/preferences/[collectionId]` — Fetch preference state
- Task 8: Verify all API routes integrate with existing database schema

Each follows: handler code → TypeScript check → curl test → commit

---

## ✅ Phase 1 Complete - Ready to Proceed?

All 8 API routes created and tested. Next: Sorting UI pages (Phase 2).

---

## Phase 2: Sorting Flows - Core Complex Feature (6 tasks)

Build UI pages for the sorting workflow. These establish patterns (progress bars, bucket displays, state machines) reused in later phases.

### Task 9: Build Sort Hub Page

**Files:**
- Modify: `src/app/collections/[id]/sort/page.tsx`

**Current state:** Basic page exists. Enhance to show active session + session cards.

**Steps:**

1. Fetch active session for collection (Server Component async)

```typescript
// src/app/collections/[id]/sort/page.tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { AppLayout } from "@/components/layout";
import { Card, Button } from "@/components/ui";
import Link from "next/link";

interface SortPageProps {
  params: { id: string };
}

export default async function SortPage({ params }: SortPageProps) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const db = getDb();
  const sessionRepo = new SessionRepository(db);
  const sessions = await sessionRepo.findByCollection(params.id);
  const activeSession = sessions.find(s => s.status === "active");

  return (
    <AppLayout breadcrumbs={[
      { label: "Collections", href: "/collections" },
      { label: "Handbags", href: `/collections/${params.id}` },
      { label: "Sort" }
    ]}>
      <div className="space-y-6">
        {activeSession && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Active Session</h3>
            <p className="text-sm text-blue-700 mb-4">{activeSession.goal} · {sessions.length} total</p>
            <div className="flex gap-3">
              <Link href={`/collections/${params.id}/sort/${activeSession.id}`}>
                <Button>Resume</Button>
              </Link>
              <Button variant="secondary">Abandon</Button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold mb-4">Sorting Sessions</h2>
          <Link href={`/collections/${params.id}/sort/new`}>
            <Button>Start New Session</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map(s => (
            <Card key={s.id} interactive>
              <h4 className="font-semibold">{s.goal}</h4>
              <p className="text-sm text-gray-600">{s.status}</p>
              <Link href={`/collections/${params.id}/sort/${s.id}`}>
                <Button size="sm" variant="ghost">View</Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
```

2. Type check: `npx tsc --noEmit src/app/collections/[id]/sort/page.tsx 2>&1 | grep -v "Cannot find name"` (should be empty)

3. Manual test: `npm run dev`, navigate to collection → Sort, verify session cards display

4. Commit

```bash
git add src/app/collections/[id]/sort/page.tsx
git commit -m "feat: enhance sort hub with active session banner"
```

---

### Tasks 10-14: Remaining Sorting Pages

Follow same pattern for:

- Task 10: Session setup page (`/collections/[id]/sort/new`) — Goal picker + scope + timebox
- Task 11: Resume session page — Progress banner + counters
- Task 12: Triage page — Single-item decision card
- Task 13: Compare page — Pairwise comparison
- Task 14: Results draft page — Enhance existing with bucket tallies + rerank UI

Each: Implement Server Component → Type check → Manual browser test → Commit

---

## ✅ Phase 2 Complete - Ready to Proceed?

All 6 sorting pages built and tested. Next: Collections/Items pages (Phase 3).

---

## Phase 3: Collections + Items Pages (7 tasks)

Add filters, badges, and stats to existing pages. Reuse patterns from Phase 2.

### Task 15: Add Status Filters to Collections Page

**Files:**
- Modify: `src/app/collections/page.tsx`

**Current state:** Grid exists. Add All/Active/Archived tabs.

**Steps:**

1. Add filter state and buttons

```typescript
// In src/app/collections/page.tsx, modify the page component
"use client";

import { useState } from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
// ... existing imports

export default async function CollectionsPage() {
  // ... existing auth check and data fetch

  // Add this in the JSX after the heading:
  // <div className="flex gap-2 mb-6">
  //   <Button variant={filter === "all" ? "primary" : "secondary"}>All</Button>
  //   <Button variant={filter === "active" ? "primary" : "secondary"}>Active</Button>
  //   <Button variant={filter === "archived" ? "primary" : "secondary"}>Archived</Button>
  // </div>

  // Filter collections based on selected status
  // const filtered = filter === "all" ? collections : collections.filter(c => c.status === filter);
}
```

2. Type check: `npx tsc --noEmit`

3. Manual test: Load /collections, click tabs, verify filtering works

4. Commit

```bash
git add src/app/collections/page.tsx
git commit -m "feat: add status filter tabs to collections page"
```

---

### Tasks 16-21: Remaining Collections/Items Enhancements

Follow same pattern for:

- Task 16: Add curator badges to collection cards
- Task 17: Verify create collection form structure
- Task 18: Add stats boxes to collection dashboard
- Task 19: Add active session banner to dashboard
- Task 20: Add filter tabs to items grid
- Task 21: Add bucket badge display to ItemCard

Each: Implement feature → Type check → Manual test → Commit

---

## ✅ Phase 3 Complete - Ready to Proceed?

All 7 collections/items pages enhanced. Next: Results/Members pages (Phase 4).

---

## Phase 4: Results + Members Pages (4 tasks)

Polish final pages. Build 1 new page (finalize), verify 3 existing.

### Task 22: Build Finalize Results Page

**Files:**
- Create: `src/app/collections/[id]/results/[resultId]/finalize/page.tsx`

**Steps:**

1. Create Server Component with form

```typescript
// src/app/collections/[id]/results/[resultId]/finalize/page.tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { AppLayout } from "@/components/layout";
import { Button, Input } from "@/components/ui";

interface FinalizePageProps {
  params: { id: string; resultId: string };
}

export default async function FinalizePage({ params }: FinalizePageProps) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const db = getDb();
  const resultRepo = new SortResultRepository(db);
  const result = await resultRepo.findById(params.resultId);

  if (!result || result.curatorId !== session.user.id) {
    redirect(`/collections/${params.id}/results`);
  }

  return (
    <AppLayout breadcrumbs={[
      { label: "Collections", href: "/collections" },
      { label: "Results" },
      { label: "Finalize" }
    ]}>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Finalize Results</h1>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Name this result</label>
            <Input defaultValue={result.name} placeholder="Spring edit 2026" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-4">Visibility</label>
            <div className="space-y-3">
              <div className="border rounded-lg p-4 bg-blue-50">
                <input type="radio" name="visibility" value="private" defaultChecked />
                <label className="ml-2 font-medium">Private</label>
                <p className="text-sm text-gray-600">Only you can see it</p>
              </div>
              <div className="border rounded-lg p-4">
                <input type="radio" name="visibility" value="shareable" />
                <label className="ml-2 font-medium">Shareable by link</label>
                <p className="text-sm text-gray-600">People you choose</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            Finalizing snapshots the current order. New sorting starts a fresh draft — this one stays frozen.
          </div>

          <div className="flex gap-3">
            <Button variant="secondary">Cancel</Button>
            <Button>Finalize</Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
```

2. Type check: `npx tsc --noEmit`

3. Manual test: Navigate to finalize page, verify form displays

4. Commit

```bash
git add src/app/collections/[id]/results/[resultId]/finalize/page.tsx
git commit -m "feat: create finalize results page"
```

---

### Tasks 23-25: Verify Results/Members Pages

- Task 23: Verify Results draft page structure (list, bucket tallies, rerank UI)
- Task 24: Verify Shared results page (read-only, finalized badge)
- Task 25: Verify Members & invitations page (member list, pending invitations, invite form)

Each: Manual browser test → Verify structure matches wireframe → Commit if changes needed

---

## ✅ Phase 4 Complete - All Pages Implemented!

---

## Full Checklist: All ~40 Tasks

### Phase 1: API Routes (8 tasks)
- [ ] Task 1: Sessions API (POST/GET)
- [ ] Task 2: Decision Events API (POST)
- [ ] Task 3: Sort Results API (POST)
- [ ] Task 4: Rerank API (PATCH)
- [ ] Task 5: Finalize Results API (POST)
- [ ] Task 6: Shared Results API (GET)
- [ ] Task 7: Preferences API (GET)
- [ ] Task 8: Verify API integration with schema

### Phase 2: Sorting Flows (6 tasks)
- [ ] Task 9: Sort Hub page
- [ ] Task 10: Session Setup page
- [ ] Task 11: Resume Session page
- [ ] Task 12: Triage page
- [ ] Task 13: Compare page
- [ ] Task 14: Results Draft page

### Phase 3: Collections/Items (7 tasks)
- [ ] Task 15: Collections filter tabs
- [ ] Task 16: Curator badges on cards
- [ ] Task 17: Create collection form
- [ ] Task 18: Dashboard stats boxes
- [ ] Task 19: Dashboard active session banner
- [ ] Task 20: Items filter tabs
- [ ] Task 21: Bucket badges on items

### Phase 4: Results/Members (4 tasks)
- [ ] Task 22: Finalize Results page
- [ ] Task 23: Verify Results draft page
- [ ] Task 24: Verify Shared results page
- [ ] Task 25: Verify Members page

### Final Verification (3 tasks)
- [ ] Task 26: Full build succeeds (`npm run build`)
- [ ] Task 27: TypeScript strict mode clean (`npx tsc --noEmit`)
- [ ] Task 28: Manual end-to-end test (login → collections → items → sort → results)

---

## Execution Strategy

**Option 1: Subagent-Driven (Recommended for this session)**
- I spawn a fresh subagent per task (or few tasks)
- Each subagent implements task, verifies, commits
- I review output between tasks
- Fast iteration, catch issues early

**Option 2: Parallel Session (For continuous batch work)**
- Open new session with executing-plans skill
- Run multiple tasks back-to-back with checkpoints
- Suits focused, uninterrupted work

Which approach would you prefer?
