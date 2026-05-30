# PurseInator Complete Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete MVP curatorial collection sorting application with service-first architecture, permission-based auth, lazy-computed preferences, and tablet-first UI.

**Architecture:** Service-first domain logic (11 services) → Drizzle persistence layer → Next.js API routes → React components. DecisionEvents as append-only source of truth. All state derived lazily. Tap-first tablet UI.

**Tech Stack:** Next.js 15, React, Neon Postgres, Drizzle ORM, Next.js Auth, Vercel Blob, TypeScript, Vitest, Tailwind CSS.

---

## Phase 0: Project Setup & Infrastructure

### Task 1: Initialize project dependencies and configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`

**Step 1: Create package.json with core dependencies**

```json
{
  "name": "purseinator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "vitest",
    "test:ui": "vitest --ui"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next-auth": "^5.0.0",
    "@vercel/blob": "^0.20.0",
    "drizzle-orm": "^0.31.0",
    "drizzle-kit": "^0.20.0",
    "@vercel/postgres": "^0.7.0",
    "postgres": "^3.4.0",
    "zod": "^3.22.0",
    "tailwindcss": "^3.4.0",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "eslint": "^8.55.0",
    "eslint-config-next": "^15.0.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
```

**Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: "./tsconfig.json",
  },
};

export default config;
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Step 5: Create .env.example**

```
DATABASE_URL=postgresql://user:password@localhost:5432/purseinator
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
BLOB_READ_WRITE_TOKEN=
EMAIL_FROM=noreply@purseinator.local
```

**Step 6: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
      },
    },
  },
  plugins: [],
};
export default config;
```

**Step 7: Create postcss.config.mjs**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 8: Commit**

```bash
git add package.json tsconfig.json next.config.ts vitest.config.ts .env.example tailwind.config.ts postcss.config.mjs
git commit -m "chore: initialize project dependencies and configuration

- Next.js 15 with TypeScript
- Drizzle ORM for Neon Postgres
- Vitest for unit testing
- Tailwind CSS for styling
- Next.js Auth ready for integration
- Environment setup with .env.example

(complete-refactor)"
```

---

### Task 2: Create directory structure and base application files

**Files:**
- Create: directory structure under `src/`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`
- Create: `src/lib/db.ts` (placeholder)

**Step 1: Create directory structure**

```bash
mkdir -p src/app/api
mkdir -p src/components/{layout,forms,ui}
mkdir -p src/features/{auth,collections,items,sessions,results,sharing}
mkdir -p src/server/{services,repositories,policies}
mkdir -p src/lib/{auth,db,permissions,blob,validation}
mkdir -p src/types
mkdir -p tests/unit/{services,repositories}
mkdir -p drizzle
```

**Step 2: Create src/app/layout.tsx**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PurseInator",
  description: "Curate what you love",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

**Step 3: Create src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #fafafa;
  color: #1f2937;
  line-height: 1.5;
}

button {
  font-family: inherit;
}

input,
textarea,
select {
  font-family: inherit;
}
```

**Step 4: Create src/app/page.tsx**

```typescript
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">PurseInator</h1>
        <p className="text-xl text-gray-600">sort what you love, let go of the rest</p>
      </div>
    </main>
  );
}
```

**Step 5: Create src/lib/db.ts (placeholder)**

```typescript
// Database connection will be set up in Phase 2 (Task 16)
export const db = null;
```

**Step 6: Create src/types/index.ts (placeholder)**

```typescript
// Domain types will be defined in Phase 1 (Task 3)
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: create directory structure and base application

- App router layout with Tailwind CSS globals
- Basic home page placeholder
- Directory structure for services, components, types
- Ready for domain implementation

(complete-refactor)"
```

---

## Phase 1: Domain Services (Layer 1)

### Task 3: Define domain model types

**Files:**
- Create: `src/types/domain.ts`
- Update: `src/types/index.ts`

**Step 1: Write domain types file with all types from design**

```typescript
// src/types/domain.ts

// ===== USER =====
export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== COLLECTION =====
export type CollectionStatus = "active" | "archived" | "deleted";

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  status: CollectionStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== COLLECTION MEMBERSHIP =====
export interface CollectionMembership {
  id: string;
  collectionId: string;
  userId: string;
  canManageCollection: boolean;
  canInviteMembers: boolean;
  canAddItems: boolean;
  canEditMetadata: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canSort: boolean;
  canViewOutputs: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ===== INVITATION =====
export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface Invitation {
  id: string;
  collectionId: string;
  email: string;
  token: string;
  canManageCollection: boolean;
  canInviteMembers: boolean;
  canAddItems: boolean;
  canEditMetadata: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canSort: boolean;
  canViewOutputs: boolean;
  status: InvitationStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
}

// ===== ITEM =====
export interface Item {
  id: string;
  collectionId: string;
  name: string;
  brand: string | null;
  style: string | null;
  color: string | null;
  material: string | null;
  category: string | null;
  status: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== PHOTO =====
export interface Photo {
  id: string;
  itemId: string;
  blobKey: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  uploadedBy: string;
  isHero: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== SESSION =====
export type SessionStatus = "active" | "paused" | "completed" | "abandoned" | "deleted";

export interface Session {
  id: string;
  collectionId: string;
  curatorId: string;
  status: SessionStatus;
  goal: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== DECISION EVENT =====
export type DecisionType = "triage" | "pairwise_compare";
export type TriageResult = "top" | "high" | "medium" | "low";
export type PairwiseResult = "item_a" | "item_b" | "tie" | "skip";

export interface DecisionEvent {
  id: string;
  sessionId: string;
  type: DecisionType;
  decision: TriageDecision | PairwiseDecision;
  createdAt: Date;
}

export interface TriageDecision {
  itemId: string;
  result: TriageResult;
}

export interface PairwiseDecision {
  itemAId: string;
  itemBId: string;
  result: PairwiseResult;
}

// ===== COLLECTION PREFERENCE ITEM =====
export type RankBucket = "top" | "high" | "medium" | "low";

export interface CollectionPreferenceItem {
  id: string;
  collectionId: string;
  curatorId: string;
  itemId: string;
  score: number;
  confidence: number;
  rankBucket: RankBucket;
  comparisonCount: number;
  lastSeen: Date;
  updatedAt: Date;
}

// ===== SORT RESULT =====
export type SortResultStatus = "draft" | "finalized";

export interface SortResult {
  id: string;
  collectionId: string;
  curatorId: string;
  status: SortResultStatus;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
}

// ===== SORT RESULT ITEM =====
export interface SortResultItem {
  id: string;
  sortResultId: string;
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
  manualRank: number | null;
  manualBucket: RankBucket | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== SORT RESULT SHARE =====
export type ShareStatus = "active" | "revoked";

export interface SortResultShare {
  id: string;
  sortResultId: string;
  shareToken: string;
  status: ShareStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== API RESPONSE =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Step 2: Update src/types/index.ts**

```typescript
export * from "./domain";
```

**Step 3: Commit**

```bash
git add src/types/
git commit -m "feat: define domain model types

- User, Collection, Item, Photo
- Session, DecisionEvent (immutable)
- CollectionMembership with 8 permission flags
- Invitation with permission flags
- CollectionPreferenceItem (lazy-computed)
- SortResult and SortResultItem
- SortResultShare with token-based access
- RankBucket type (top|high|medium|low)

(complete-refactor)"
```

---

### Task 4: Create UserService with repository interface and tests

**Files:**
- Create: `src/server/repositories/UserRepository.ts`
- Create: `src/server/services/UserService.ts`
- Create: `tests/unit/services/UserService.test.ts`

**Step 1: Define UserRepository interface**

```typescript
// src/server/repositories/UserRepository.ts
import type { User } from "@/types";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: { email: string; name?: string }): Promise<User>;
  update(id: string, data: Partial<Omit<User, "id" | "createdAt">>): Promise<User>;
  softDelete(id: string): Promise<User>;
}
```

**Step 2: Write failing test**

```typescript
// tests/unit/services/UserService.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UserService } from "@/server/services/UserService";
import type { UserRepository } from "@/server/repositories/UserRepository";

describe("UserService", () => {
  let mockRepo: UserRepository;
  let service: UserService;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new UserService(mockRepo);
  });

  describe("getCurrentUser", () => {
    it("returns the current user", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockUser);

      const result = await service.getCurrentUser("user-123");

      expect(result).toEqual(mockUser);
      expect(mockRepo.findById).toHaveBeenCalledWith("user-123");
    });

    it("returns null for non-existent user", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getCurrentUser("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("updates user name and returns updated user", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "New Name",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(mockUser);

      const result = await service.updateProfile("user-123", { name: "New Name" });

      expect(result.name).toBe("New Name");
      expect(mockRepo.update).toHaveBeenCalledWith("user-123", expect.objectContaining({ name: "New Name" }));
    });
  });

  describe("deleteAccount", () => {
    it("soft-deletes user account", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.mocked(mockRepo.softDelete).mockResolvedValueOnce(mockUser);

      const result = await service.deleteAccount("user-123");

      expect(result.deletedAt).toBeDefined();
      expect(mockRepo.softDelete).toHaveBeenCalledWith("user-123");
    });
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npm test -- UserService.test.ts
```

Expected: FAIL - UserService not implemented

**Step 4: Implement UserService**

```typescript
// src/server/services/UserService.ts
import type { User } from "@/types";
import type { UserRepository } from "@/server/repositories/UserRepository";

export class UserService {
  constructor(private repo: UserRepository) {}

  async getCurrentUser(userId: string): Promise<User | null> {
    return this.repo.findById(userId);
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string }
  ): Promise<User> {
    return this.repo.update(userId, {
      name: data.name,
      email: data.email,
      updatedAt: new Date(),
    });
  }

  async deleteAccount(userId: string): Promise<User> {
    return this.repo.softDelete(userId);
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- UserService.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/server/repositories/UserRepository.ts src/server/services/UserService.ts tests/unit/services/UserService.test.ts
git commit -m "feat: implement UserService

- Define UserRepository interface
- UserService methods: getCurrentUser, updateProfile, deleteAccount
- Unit tests with mock repository
- Service layer depends on repository abstraction (implemented in Layer 2)

(complete-refactor)"
```

---

### Task 5-14: Implement remaining 10 domain services

Following the same pattern as Task 4 (repository interface → service implementation → unit tests):

**Services to implement (one per task):**

**Task 5: CollectionService**
- createCollection(data)
- getCollection(id)
- updateCollection(id, data)
- archiveCollection(id)
- restoreCollection(id)
- deleteCollection(id)
- purgeCollection(id, confirm)

**Task 6: ItemService**
- createItem(collectionId, data)
- getItem(id)
- updateItem(id, data)
- deleteItem(id)
- restoreItem(id)
- purgeItem(id)

**Task 7: PhotoService**
- uploadPhoto(itemId, file, uploadedBy)
- getPhoto(id)
- deletePhoto(id)
- setHeroPhoto(itemId, photoId)

**Task 8: SessionService**
- createSession(collectionId, curatorId, goal?)
- getSession(id)
- getActiveSession(collectionId, curatorId)
- pauseSession(id)
- resumeSession(id)
- completeSession(id)
- abandonSession(id)

**Task 9: DecisionEventService**
- createTriageDecision(sessionId, itemId, result)
- createPairwiseDecision(sessionId, itemAId, itemBId, result)
- getSessionDecisions(sessionId)
- getDecisionEvent(id)

**Task 10: ScoringService**
- computePreferences(collectionId, curatorId)
- computeItemPreference(itemId, curatorId)
- scoreFromTriageEvent(result) → number
- scoreFromPairwiseEvent(currentScore, winner) → number

**Task 11: PairingService**
- selectNextPair(sessionId) → { itemA, itemB } | null
- prioritizeByGoal(goal, items) → ordered list

**Task 12: PreferenceStateService**
- recalculatePreferences(collectionId)
- clearPreferences(collectionId)
- getPreferenceSummary(collectionId, curatorId)
- getItemPreferences(collectionId, curatorId) → all items with scores

**Task 13: SortResultService**
- createDraftResult(collectionId, curatorId, name)
- getDraftResult(id)
- updateResultName(id, name)
- setManualOverride(resultItemId, rank?, bucket?)
- resetManualOverride(resultItemId)
- finalizeResult(id)
- supersedeResult(id) → new draft

**Task 14: Invitation & MembershipService**
- createInvitation(collectionId, email, permissions)
- acceptInvitation(token, userId)
- resendInvitation(id)
- revokeInvitation(id)
- addMember(collectionId, userId, permissions)
- updateMemberPermissions(membershipId, permissions)
- removeMember(membershipId)
- getSortResultShareService().createShare(resultId, expiry?)
- getSortResultShareService().viewSharedResult(token)

Each task follows the same pattern:
1. Define repository interface
2. Write failing tests
3. Implement service
4. Run tests (PASS)
5. Commit

---

## Phase 2: Persistence Layer (Layer 2)

### Task 15: Design Drizzle schema and create migrations

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/migrations/0001_initial_schema.sql`

[Detailed schema with all 12 tables, types, constraints, indexes]

---

### Task 16-20: Implement repository classes for each domain service

Each task: implement concrete repository using Drizzle ORM, write integration tests against real database.

---

## Phase 3: API Routes (Layer 3)

### Task 21-30: Create API route handlers for each resource

Routes organized by resource:
- `/api/users` → UserController
- `/api/collections` → CollectionController
- `/api/items` → ItemController
- `/api/photos` → PhotoController
- `/api/sessions` → SessionController
- `/api/decisions` → DecisionController
- `/api/preferences` → PreferenceController
- `/api/results` → ResultController
- `/api/shares` → ShareController
- `/api/invitations` → InvitationController

Each includes: authorization checks, request validation, error handling.

---

## Phase 4: React Components (Layer 4)

### Task 31-40: Create UI components and screens

Screens organized by feature:
- Auth: sign in, sign up
- Collections: list, create, dashboard, settings
- Items: grid, detail, add/edit, upload photos
- Members: list, invite, permissions
- Sorting: session setup, triage screen, compare screen
- Results: draft review, manual re-rank, finalize, view shared
- Navigation: layout, header, sidebar

All tap-first, tablet-optimized, button-based.

---

## Phase 5: Integration & Polish (Layer 5)

### Task 41-45: Infrastructure integration

- Auth setup with NextAuth
- Blob storage integration
- Validation utilities (Zod schemas)
- Error handling middleware
- Environment configuration

---

## Execution Readiness

✅ Design doc approved
✅ Implementation plan detailed with exact file paths and code
✅ Task structure clear: unit test → implement → integration test → commit
✅ Layer-first approach maintains separation of concerns
✅ Each task is 2-5 minutes of focused work
✅ Frequent commits for safety

**Next step:** Execute Phase 0 tasks to scaffold the project, then implement Phase 1 services with full test coverage.
