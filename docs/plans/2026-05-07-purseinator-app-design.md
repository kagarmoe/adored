# Purseinator App — Design Document

Date: 2026-05-07

## What We're Building

A Next.js web app for curating handbag collections through pairwise comparisons. An operator (Kimberly) photographs and uploads items; a curator (Rachel, and others) ranks them through short, self-timed sessions. The app surfaces tiers — Favorites, Strong Keeps, Maybe Keeps, Below the Line — as rankings converge.

This is a complete rewrite of the existing Python/FastAPI + Vite React stack, unified into a single Next.js app deployed on Vercel.

## Core Truth (Design Anchor)

This is about making emotionally loaded decisions about beloved objects. The bags have histories. Rachel isn't shopping — she's sorting through her life. The app's job is to make that process feel safe, unhurried, and supported. Not a store. Not a marketplace. Not a judge.

---

## Architecture

**Stack**: Next.js App Router · Prisma · Neon (PostgreSQL) · Vercel Blob · Auth.js v5 · Resend · Vitest · Playwright

**Route structure**:
```
app/
├── (curator)/              Rachel's routes — minimal chrome
│   ├── page.tsx            Collection picker
│   └── [id]/
│       ├── page.tsx        Ranked list (four tier sections)
│       ├── rank/
│       │   ├── page.tsx    Session length picker (1–15 min)
│       │   └── compare/    Pairwise comparison screen
├── (operator)/             Kimberly's routes — slightly denser
│   ├── dashboard/          All collections, item counts
│   └── collections/[id]/
│       ├── page.tsx        Item grid
│       └── upload/         Drag-and-drop photo upload
├── login/                  Magic link entry
├── auth/verify/            Token verification + role redirect
└── api/
    └── photos/[key]/       Vercel Blob photo serving
```

Route groups `(curator)` and `(operator)` give each persona their own layout without affecting URLs. All mutations go through Server Actions in `actions/`. Photo serving is the one Route Handler (binary streaming).

**Directory layout**:
```
actions/            Server Actions (collections, items, photos, ranking)
components/         Shared UI components
lib/
  db.ts             Prisma client singleton
  auth.ts           Auth.js config
  elo.ts            Elo calculation + tier logic
prisma/
  schema.prisma
```

---

## Data Model

```prisma
model User {
  id          Int          @id @default(autoincrement())
  email       String       @unique
  name        String
  role        Role
  createdAt   DateTime     @default(now())
  collections Collection[]
  sessions    Session[]    // Auth.js sessions
}

model Collection {
  id          Int      @id @default(autoincrement())
  owner       User     @relation(fields: [ownerId], references: [id])
  ownerId     Int
  name        String
  description String   @default("")
  createdAt   DateTime @default(now())
  items       Item[]
}

model Item {
  id           Int          @id @default(autoincrement())
  collection   Collection   @relation(fields: [collectionId], references: [id])
  collectionId Int
  brand        String       @default("")
  style        String       @default("")
  color        String       @default("")
  material     String       @default("")
  eloRating    Float        @default(1000)
  createdAt    DateTime     @default(now())
  photos       Photo[]
  comparisonsAsA Comparison[] @relation("ItemA")
  comparisonsAsB Comparison[] @relation("ItemB")
  wins           Comparison[] @relation("Winner")
}

model Photo {
  id         Int      @id @default(autoincrement())
  item       Item     @relation(fields: [itemId], references: [id])
  itemId     Int
  blobKey    String   @unique
  isHero     Boolean  @default(false)
  uploadedAt DateTime @default(now())
}

model Comparison {
  id        Int      @id @default(autoincrement())
  itemA     Item     @relation("ItemA", fields: [itemAId], references: [id])
  itemAId   Int
  itemB     Item     @relation("ItemB", fields: [itemBId], references: [id])
  itemBId   Int
  winner    Item     @relation("Winner", fields: [winnerId], references: [id])
  winnerId  Int
  infoShown String   // photo_only | photo_brand | photo_brand_detail
  createdAt DateTime @default(now())
}

enum Role {
  operator
  curator
}
```

**No `keeperStatus` field** — tiers are computed dynamically from Elo percentile rank within a collection after each comparison.

---

## Tier Logic

After every comparison, all items in the collection are re-ranked by Elo rating. Tiers assigned by percentile:

| Tier | Percentile | Label |
|------|-----------|-------|
| 1 | Top 25% | Favorites |
| 2 | 25–35% | Strong Keeps |
| 3 | 35–45% | Maybe Keeps |
| 4 | Below 45% | Below the Line |

Tiers are computed fresh on every collection view — never stored.

---

## Pages & UX

### Curator (Rachel)

**Collection picker** (`/`): Her collections at a glance. Warm, photo-forward.

**Ranked list** (`/[id]`): Four tier sections separated by soft horizontal rules with small, handwritten-feeling labels. Photos large, metadata minimal.

**Session picker** (`/[id]/rank`): Rachel sets her own session length, 1–15 min. A friendly note that past 15 minutes it stops being useful. No prescriptive options — a slider or simple input.

**Comparison screen** (`/[id]/rank/compare`): Two large photos. A single question. Nothing else competing for attention. A thin warm arc at the edge of the screen quietly drains as time passes — not a countdown clock. When the session ends: a gentle "that's enough for today" message, never a jarring alarm.

### Operator (Kimberly)

**Dashboard** (`/dashboard`): All collections, item counts, upload status.

**Item grid** (`/collections/[id]`): Hero photos, brand/style labels, Elo tier indicator.

**Upload** (`/collections/[id]/upload`): Drag-and-drop photos, assign to items, set metadata (brand, style, color, material).

### Auth

**Login** (`/login`): Enter email → magic link sent via Resend.

**Verify** (`/auth/verify`): Token verified → session created → redirect by role (operator → `/dashboard`, curator → `/`).

New users are invited — Kimberly creates accounts (email + role) from the operator dashboard. Magic links authenticate but do not create accounts.

---

## Auth

Auth.js v5 with email magic links via Resend. No OAuth, no passwords, no Google dependency. Multiple curators supported.

---

## Design

**Feeling**: trusted friend's living room, not a magazine or marketplace.

**Typography**:
- Display: Fraunces (lighter weights — warm, slightly quirky, not commanding)
- Body: Lora (readable, warm)

**Color**:
```
ground:   hsl(38 20% 97%)   very warm near-white, paper-like
surface:  hsl(38 15% 93%)   card backgrounds
text:     hsl(20 20% 12%)   warm near-black
accent:   hsl(14 55% 52%)   soft terracotta — one committed color
muted:    hsl(20 12% 52%)   secondary text
```

**Key details**:
- Tier dividers: soft horizontal rules, small quiet labels — not bold section headers
- Comparison screen: two bags, nothing else
- Timer: a draining arc, not a clock
- Session end: gentle message, never an alarm

---

## Testing

**Unit (Vitest)** — pure logic, no database:
- `lib/elo.test.ts` — Elo calculation, tier percentile logic
- `lib/pairing.test.ts` — next-pair selection algorithm
- `actions/*.test.ts` — Server Action validation, auth guards

**Integration (Vitest + Prisma test client)** — real database (SQLite), isolated per test:
- Collection CRUD
- Comparison recording
- Tier recomputation after comparisons

**E2E (Playwright)** — full stack, real browser:
- Comparison flow → tier update
- Session timer expiry → gentle end screen
- Operator photo upload → item appears in collection
- Magic link auth → correct role redirect

**TDD discipline**: Elo and pairing logic written test-first. E2E tests written alongside each page.
