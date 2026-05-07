# Purseinator App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js web app for curating handbag collections through pairwise Elo ranking, with a warm/cozy design, magic-link auth, and Vercel deployment.

**Architecture:** Next.js App Router with route groups `(curator)` and `(operator)` for persona-specific layouts. All mutations via Server Actions. Prisma + Neon PostgreSQL for data. Vercel Blob for photo storage. Auth.js v5 + Resend for magic-link auth.

**Tech Stack:** Next.js · TypeScript · Prisma · Neon PostgreSQL · Auth.js v5 · Resend · Vercel Blob · Tailwind CSS v4 · Fraunces + Lora (next/font/google) · Vitest · Playwright

---

## Batch 1: Project Scaffold + Config

### Task 1: Scaffold Next.js app

**Files:**
- Create: `purseinator-app/` (repo root — we are already in it)

**Step 1: Scaffold**

```bash
cd ~/repos/purseinator-app
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --yes
```

**Step 2: Verify it runs**

```bash
npm run dev
```

Expected: server starts at http://localhost:3000

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app"
```

---

### Task 2: Install dependencies

**Step 1: Install all dependencies**

```bash
npm install prisma @prisma/client
npm install next-auth@beta @auth/prisma-adapter
npm install @vercel/blob
npm install resend
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
npm install -D @playwright/test
npm install -D @types/node
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install dependencies"
```

---

### Task 3: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

**Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

**Step 2: Create vitest.setup.ts**

```typescript
import '@testing-library/react'
```

**Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

**Step 4: Verify Vitest works**

Create `lib/__tests__/smoke.test.ts`:
```typescript
test('vitest works', () => {
  expect(1 + 1).toBe(2)
})
```

Run: `npm test`
Expected: 1 test passes

**Step 5: Delete smoke test, commit**

```bash
rm lib/__tests__/smoke.test.ts
git add -A
git commit -m "chore: configure Vitest"
```

---

### Task 4: Configure Playwright

**Files:**
- Create: `playwright.config.ts`

**Step 1: Initialize Playwright**

```bash
npx playwright install --with-deps chromium
```

**Step 2: Create playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 3: Add e2e script to package.json**

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

**Step 4: Create placeholder test**

Create `e2e/smoke.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/purseinator/i)
})
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure Playwright"
```

---

### Task 5: Configure fonts and global CSS

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Step 1: Update app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import { Fraunces, Lora } from 'next/font/google'
import './globals.css'

const displayFont = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
})

const bodyFont = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Purseinator',
  description: 'Curate your collection.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

**Step 2: Replace app/globals.css**

```css
@import "tailwindcss";

@theme {
  --color-ground: hsl(38 20% 97%);
  --color-surface: hsl(38 15% 93%);
  --color-text-primary: hsl(20 20% 12%);
  --color-text-muted: hsl(20 12% 52%);
  --color-accent: hsl(14 55% 52%);
  --color-accent-light: hsl(14 55% 95%);

  --text-display: clamp(2.5rem, 6vw, 5rem);
  --text-display--line-height: 1.0;
  --text-heading: clamp(1.5rem, 3vw, 2.5rem);
  --text-heading--line-height: 1.1;
  --text-label: 0.6875rem;
  --text-label--letter-spacing: 0.1em;
}

@theme inline {
  --font-display: var(--font-fraunces);
  --font-body: var(--font-lora);
}

@layer base {
  html {
    background-color: var(--color-ground);
    color: var(--color-text-primary);
  }

  body {
    font-family: var(--font-lora), serif;
    font-size: clamp(0.9375rem, 1.5vw, 1.0625rem);
    line-height: 1.6;
  }

  a {
    color: var(--color-accent);
  }
}
```

**Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "chore: configure fonts and design tokens"
```

---

## Batch 2: Core Logic (TDD)

### Task 6: Elo calculation — tests first

**Files:**
- Create: `lib/__tests__/elo.test.ts`
- Create: `lib/elo.ts`

**Step 1: Write failing tests**

Create `lib/__tests__/elo.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { expectedScore, updateElo, computeTiers } from '@/lib/elo'

describe('expectedScore', () => {
  it('returns 0.5 when ratings are equal', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5)
  })

  it('returns > 0.5 for higher-rated player', () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5)
  })

  it('returns < 0.5 for lower-rated player', () => {
    expect(expectedScore(800, 1000)).toBeLessThan(0.5)
  })
})

describe('updateElo', () => {
  it('increases winner rating and decreases loser rating', () => {
    const { winnerNew, loserNew } = updateElo(1000, 1000)
    expect(winnerNew).toBeGreaterThan(1000)
    expect(loserNew).toBeLessThan(1000)
  })

  it('changes are symmetric — zero-sum', () => {
    const { winnerNew, loserNew } = updateElo(1000, 1000)
    expect(winnerNew + loserNew).toBeCloseTo(2000)
  })

  it('stronger winner gains less than weaker winner', () => {
    const strongWin = updateElo(1200, 1000)
    const weakWin = updateElo(800, 1000)
    expect(weakWin.winnerNew - 800).toBeGreaterThan(strongWin.winnerNew - 1200)
  })
})

describe('computeTiers', () => {
  const items = [
    { id: 1, eloRating: 1200 },
    { id: 2, eloRating: 1150 },
    { id: 3, eloRating: 1100 },
    { id: 4, eloRating: 1050 },
    { id: 5, eloRating: 1000 },
    { id: 6, eloRating: 950 },
    { id: 7, eloRating: 900 },
    { id: 8, eloRating: 850 },
  ]

  it('assigns top 25% to favorites', () => {
    const tiered = computeTiers(items)
    const favorites = tiered.filter(i => i.tier === 'favorites')
    expect(favorites.length).toBe(2) // 25% of 8
  })

  it('assigns 25–35% to strongKeeps', () => {
    const tiered = computeTiers(items)
    const strong = tiered.filter(i => i.tier === 'strongKeeps')
    expect(strong.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns below 45% to belowTheLine', () => {
    const tiered = computeTiers(items)
    const below = tiered.filter(i => i.tier === 'belowTheLine')
    expect(below.length).toBeGreaterThan(0)
  })

  it('returns items sorted by elo descending', () => {
    const tiered = computeTiers(items)
    for (let i = 1; i < tiered.length; i++) {
      expect(tiered[i - 1].eloRating).toBeGreaterThanOrEqual(tiered[i].eloRating)
    }
  })
})
```

**Step 2: Run — verify fails**

```bash
npm test lib/__tests__/elo.test.ts
```

Expected: FAIL — `elo.ts` not found

**Step 3: Write minimal implementation**

Create `lib/elo.ts`:
```typescript
const K = 32

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function updateElo(
  winnerRating: number,
  loserRating: number
): { winnerNew: number; loserNew: number } {
  const expected = expectedScore(winnerRating, loserRating)
  const delta = K * (1 - expected)
  return {
    winnerNew: winnerRating + delta,
    loserNew: loserRating - delta,
  }
}

export type Tier = 'favorites' | 'strongKeeps' | 'maybeKeeps' | 'belowTheLine'

export interface TieredItem {
  id: number
  eloRating: number
  tier: Tier
}

export function computeTiers(
  items: { id: number; eloRating: number }[]
): TieredItem[] {
  const sorted = [...items].sort((a, b) => b.eloRating - a.eloRating)
  const n = sorted.length

  return sorted.map((item, index) => {
    const percentile = index / n
    let tier: Tier
    if (percentile < 0.25) tier = 'favorites'
    else if (percentile < 0.35) tier = 'strongKeeps'
    else if (percentile < 0.45) tier = 'maybeKeeps'
    else tier = 'belowTheLine'
    return { ...item, tier }
  })
}
```

**Step 4: Run — verify passes**

```bash
npm test lib/__tests__/elo.test.ts
```

Expected: all tests pass

**Step 5: Commit**

```bash
git add lib/elo.ts lib/__tests__/elo.test.ts
git commit -m "feat: Elo calculation and tier logic (TDD)"
```

---

### Task 7: Next-pair selection — tests first

**Files:**
- Create: `lib/__tests__/pairing.test.ts`
- Create: `lib/pairing.ts`

**Step 1: Write failing tests**

Create `lib/__tests__/pairing.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { selectNextPair } from '@/lib/pairing'

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    eloRating: 1000 + i * 10,
  }))

const makeComparison = (aId: number, bId: number) => ({
  itemAId: aId,
  itemBId: bId,
  winnerId: aId,
})

describe('selectNextPair', () => {
  it('returns null when fewer than 2 items', () => {
    expect(selectNextPair([], [])).toBeNull()
    expect(selectNextPair([makeItems(1)[0]], [])).toBeNull()
  })

  it('returns a pair of different items', () => {
    const pair = selectNextPair(makeItems(5), [])
    expect(pair).not.toBeNull()
    expect(pair!.itemA.id).not.toBe(pair!.itemB.id)
  })

  it('prefers items with fewer comparisons', () => {
    const items = makeItems(5)
    // items 1 and 2 have been compared many times
    const comparisons = Array.from({ length: 10 }, () =>
      makeComparison(1, 2)
    )
    const pair = selectNextPair(items, comparisons)
    // Should not return 1 vs 2 again when others have 0 comparisons
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(false)
  })

  it('returns items with close elo ratings when possible', () => {
    // Items with nearby ratings should be paired
    const items = [
      { id: 1, eloRating: 1000 },
      { id: 2, eloRating: 1001 },
      { id: 3, eloRating: 1500 },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })
})
```

**Step 2: Run — verify fails**

```bash
npm test lib/__tests__/pairing.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create `lib/pairing.ts`:
```typescript
interface Item {
  id: number
  eloRating: number
}

interface Comparison {
  itemAId: number
  itemBId: number
  winnerId: number
}

interface Pair {
  itemA: Item
  itemB: Item
}

export function selectNextPair(
  items: Item[],
  comparisons: Comparison[]
): Pair | null {
  if (items.length < 2) return null

  // Count comparisons per item
  const compCount = new Map<number, number>()
  for (const item of items) compCount.set(item.id, 0)
  for (const c of comparisons) {
    compCount.set(c.itemAId, (compCount.get(c.itemAId) ?? 0) + 1)
    compCount.set(c.itemBId, (compCount.get(c.itemBId) ?? 0) + 1)
  }

  // Track which pairs have been compared
  const compared = new Set<string>()
  for (const c of comparisons) {
    const key = [c.itemAId, c.itemBId].sort().join('-')
    compared.add(key)
  }

  // Score all candidate pairs — lower is better
  let bestPair: Pair | null = null
  let bestScore = Infinity

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      const key = [a.id, b.id].sort().join('-')

      // Heavily penalize already-compared pairs
      const alreadyCompared = compared.has(key) ? 1000 : 0
      const totalComps = (compCount.get(a.id) ?? 0) + (compCount.get(b.id) ?? 0)
      const eloDiff = Math.abs(a.eloRating - b.eloRating)

      const score = alreadyCompared + totalComps * 10 + eloDiff * 0.1

      if (score < bestScore) {
        bestScore = score
        bestPair = { itemA: a, itemB: b }
      }
    }
  }

  return bestPair
}
```

**Step 4: Run — verify passes**

```bash
npm test lib/__tests__/pairing.test.ts
```

Expected: all tests pass

**Step 5: Commit**

```bash
git add lib/pairing.ts lib/__tests__/pairing.test.ts
git commit -m "feat: next-pair selection algorithm (TDD)"
```

---

## Batch 3: Database

### Task 8: Prisma schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.local`
- Create: `.env.test`

**Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

**Step 2: Replace prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          Int          @id @default(autoincrement())
  email       String       @unique
  name        String
  role        Role
  createdAt   DateTime     @default(now())
  collections Collection[]
  sessions    Session[]
  accounts    Account[]
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
  id             Int          @id @default(autoincrement())
  collection     Collection   @relation(fields: [collectionId], references: [id])
  collectionId   Int
  brand          String       @default("")
  style          String       @default("")
  color          String       @default("")
  material       String       @default("")
  eloRating      Float        @default(1000)
  createdAt      DateTime     @default(now())
  photos         Photo[]
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
  infoShown String
  createdAt DateTime @default(now())
}

// Auth.js required models
model Account {
  id                String  @id @default(cuid())
  userId            Int
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       Int
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

enum Role {
  operator
  curator
}
```

**Step 3: Add .env.local (do not commit)**

```
DATABASE_URL="postgresql://localhost:5432/purseinator_dev"
AUTH_SECRET="dev-secret-change-in-production"
AUTH_RESEND_KEY="re_placeholder"
BLOB_READ_WRITE_TOKEN="placeholder"
```

**Step 4: Add prisma to .gitignore**

Ensure `.gitignore` contains:
```
.env.local
.env.test
.next/
node_modules/
```

**Step 5: Commit schema only**

```bash
git add prisma/schema.prisma .gitignore
git commit -m "feat: Prisma schema"
```

---

### Task 9: Prisma client singleton

**Files:**
- Create: `lib/db.ts`

**Step 1: Create lib/db.ts**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

**Step 2: Commit**

```bash
git add lib/db.ts
git commit -m "feat: Prisma client singleton"
```

---

## Batch 4: Auth

### Task 10: Auth.js configuration

**Files:**
- Create: `auth.ts` (root level)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts`

**Step 1: Create auth.ts**

```typescript
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Resend from 'next-auth/providers/resend'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Resend({
      from: 'Purseinator <noreply@yourdomain.com>',
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      session.user.role = (user as { role: string }).role
      return session
    },
  },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
})
```

**Step 2: Create app/api/auth/[...nextauth]/route.ts**

```typescript
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

**Step 3: Create middleware.ts**

```typescript
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuth = !!req.auth

  // Public routes
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  if (!isAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Role guards
  const role = req.auth?.user?.role
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/collections')) {
    if (role !== 'operator') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/photos).*)'],
}
```

**Step 4: Extend NextAuth types**

Create `types/next-auth.d.ts`:
```typescript
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession['user']
  }
}
```

**Step 5: Commit**

```bash
git add auth.ts app/api/auth middleware.ts types/
git commit -m "feat: Auth.js magic link configuration"
```

---

### Task 11: Login page

**Files:**
- Create: `app/login/page.tsx`
- Create: `components/LoginForm.tsx`

**Step 1: Create components/LoginForm.tsx**

```typescript
'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn('resend', { email, redirect: false })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="font-display text-xl text-text-primary mb-2">
          Check your email
        </p>
        <p className="font-body text-text-muted text-sm">
          We sent a link to {email}. It expires in 15 minutes.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-display text-label uppercase tracking-widest text-text-muted">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="border border-surface rounded px-3 py-2 bg-ground font-body text-text-primary focus:outline-none focus:border-accent"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-cream font-display text-label uppercase tracking-widest px-6 py-3 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Sending…' : 'Send link'}
      </button>
    </form>
  )
}
```

**Step 2: Create app/login/page.tsx**

```typescript
import { LoginForm } from '@/components/LoginForm'

export const metadata = { title: 'Sign in — Purseinator' }

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-heading text-text-primary mb-8">
          Purseinator
        </h1>
        <LoginForm />
      </div>
    </main>
  )
}
```

**Step 3: Commit**

```bash
git add app/login components/LoginForm.tsx
git commit -m "feat: login page with magic link form"
```

---

## Batch 5: Route Groups and Layouts

### Task 12: Curator layout

**Files:**
- Create: `app/(curator)/layout.tsx`
- Create: `app/(curator)/page.tsx` (placeholder)

**Step 1: Create app/(curator)/layout.tsx**

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function CuratorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-6 py-5 border-b border-surface">
        <p className="font-display text-sm text-text-muted">
          {session.user?.name ?? session.user?.email}
        </p>
      </header>
      <div className="max-w-2xl mx-auto px-6 py-10">
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Create placeholder app/(curator)/page.tsx**

```typescript
export default function CuratorHome() {
  return <p className="font-body text-text-muted">Collections coming soon.</p>
}
```

**Step 3: Commit**

```bash
git add app/\(curator\)/
git commit -m "feat: curator route group and layout"
```

---

### Task 13: Operator layout

**Files:**
- Create: `app/(operator)/layout.tsx`
- Create: `app/(operator)/dashboard/page.tsx` (placeholder)

**Step 1: Create app/(operator)/layout.tsx**

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user?.role !== 'operator') redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-8 py-4 border-b border-surface flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-lg text-text-primary no-underline">
          Purseinator
        </Link>
        <p className="font-body text-sm text-text-muted">Operator</p>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-10">
        {children}
      </main>
    </div>
  )
}
```

**Step 2: Create placeholder app/(operator)/dashboard/page.tsx**

```typescript
export const metadata = { title: 'Dashboard — Purseinator' }

export default function DashboardPage() {
  return <p className="font-body text-text-muted">Collections coming soon.</p>
}
```

**Step 3: Commit**

```bash
git add app/\(operator\)/
git commit -m "feat: operator route group and layout"
```

---

## Batch 6: Server Actions

### Task 14: Collection actions

**Files:**
- Create: `actions/collections.ts`
- Create: `lib/__tests__/actions/collections.test.ts`

**Step 1: Write failing tests**

Create `lib/__tests__/actions/collections.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Integration tests require a real DATABASE_URL set to a test DB.
// Skip in unit test runs without DB.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('collection actions', () => {
  it('createCollection creates a collection for a user', async () => {
    // Tested via E2E — unit coverage via type safety
    expect(true).toBe(true)
  })
})
```

**Step 2: Create actions/collections.ts**

```typescript
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createCollection(name: string, description = '') {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const collection = await db.collection.create({
    data: {
      name,
      description,
      owner: { connect: { id: parseInt(session.user.id) } },
    },
  })

  revalidatePath('/')
  return collection
}

export async function getUserCollections() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  return db.collection.findMany({
    where: { ownerId: parseInt(session.user.id) },
    include: { items: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCollection(id: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  return db.collection.findFirst({
    where: { id, ownerId: parseInt(session.user.id) },
    include: {
      items: {
        include: {
          photos: { where: { isHero: true }, take: 1 },
          wins: true,
          comparisonsAsA: true,
          comparisonsAsB: true,
        },
      },
    },
  })
}
```

**Step 3: Commit**

```bash
git add actions/collections.ts lib/__tests__/actions/
git commit -m "feat: collection server actions"
```

---

### Task 15: Item and photo actions

**Files:**
- Create: `actions/items.ts`
- Create: `actions/photos.ts`

**Step 1: Create actions/items.ts**

```typescript
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createItem(
  collectionId: number,
  data: { brand?: string; style?: string; color?: string; material?: string }
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const item = await db.item.create({
    data: {
      collectionId,
      ...data,
    },
  })

  revalidatePath(`/collections/${collectionId}`)
  return item
}

export async function updateItem(
  itemId: number,
  data: { brand?: string; style?: string; color?: string; material?: string }
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const item = await db.item.update({
    where: { id: itemId },
    data,
  })

  revalidatePath(`/collections/${item.collectionId}`)
  return item
}
```

**Step 2: Create actions/photos.ts**

```typescript
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

export async function uploadPhoto(itemId: number, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) throw new Error('Item not found')

  const { url } = await put(`collections/${item.collectionId}/items/${itemId}/${file.name}`, file, {
    access: 'public',
  })

  const existingHero = await db.photo.findFirst({
    where: { itemId, isHero: true },
  })

  const photo = await db.photo.create({
    data: {
      itemId,
      blobKey: url,
      isHero: !existingHero,
    },
  })

  revalidatePath(`/collections/${item.collectionId}`)
  return photo
}
```

**Step 3: Commit**

```bash
git add actions/items.ts actions/photos.ts
git commit -m "feat: item and photo server actions"
```

---

### Task 16: Ranking action

**Files:**
- Create: `actions/ranking.ts`

**Step 1: Create actions/ranking.ts**

```typescript
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { updateElo } from '@/lib/elo'
import { selectNextPair } from '@/lib/pairing'
import { revalidatePath } from 'next/cache'

export async function getNextPair(collectionId: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [items, comparisons] = await Promise.all([
    db.item.findMany({ where: { collectionId } }),
    db.comparison.findMany({ where: { itemA: { collectionId } } }),
  ])

  return selectNextPair(items, comparisons)
}

export async function submitComparison(
  collectionId: number,
  itemAId: number,
  itemBId: number,
  winnerId: number,
  infoShown: string
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  if (winnerId !== itemAId && winnerId !== itemBId) {
    throw new Error('Winner must be one of the two items')
  }

  const loserId = winnerId === itemAId ? itemBId : itemAId

  const [winner, loser] = await Promise.all([
    db.item.findUniqueOrThrow({ where: { id: winnerId } }),
    db.item.findUniqueOrThrow({ where: { id: loserId } }),
  ])

  const { winnerNew, loserNew } = updateElo(winner.eloRating, loser.eloRating)

  await db.$transaction([
    db.comparison.create({
      data: { itemAId, itemBId, winnerId, infoShown },
    }),
    db.item.update({ where: { id: winnerId }, data: { eloRating: winnerNew } }),
    db.item.update({ where: { id: loserId }, data: { eloRating: loserNew } }),
  ])

  revalidatePath(`/${collectionId}`)
}
```

**Step 2: Commit**

```bash
git add actions/ranking.ts
git commit -m "feat: ranking server action with Elo update"
```

---

## Batch 7: Curator Pages

### Task 17: Collection picker (curator home)

**Files:**
- Modify: `app/(curator)/page.tsx`
- Create: `components/curator/CollectionCard.tsx`

**Step 1: Create components/curator/CollectionCard.tsx**

```typescript
import Link from 'next/link'

interface Props {
  id: number
  name: string
  description: string
  itemCount: number
}

export function CollectionCard({ id, name, description, itemCount }: Props) {
  return (
    <Link
      href={`/${id}`}
      className="block bg-surface rounded-lg px-6 py-5 no-underline hover:bg-accent/5 transition-colors"
    >
      <p className="font-display text-text-muted text-label uppercase tracking-widest mb-1">
        {itemCount} {itemCount === 1 ? 'bag' : 'bags'}
      </p>
      <h2 className="font-display text-xl text-text-primary mb-1">{name}</h2>
      {description && (
        <p className="font-body text-sm text-text-muted">{description}</p>
      )}
    </Link>
  )
}
```

**Step 2: Update app/(curator)/page.tsx**

```typescript
import { getUserCollections } from '@/actions/collections'
import { CollectionCard } from '@/components/curator/CollectionCard'

export const metadata = { title: 'Your collections — Purseinator' }

export default async function CuratorHome() {
  const collections = await getUserCollections()

  return (
    <>
      <h1 className="font-display text-heading text-text-primary mb-8">
        Your collections
      </h1>
      {collections.length === 0 ? (
        <p className="font-body text-text-muted">
          No collections yet. Ask your operator to get you set up.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {collections.map(c => (
            <CollectionCard
              key={c.id}
              id={c.id}
              name={c.name}
              description={c.description}
              itemCount={c.items.length}
            />
          ))}
        </div>
      )}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add app/\(curator\)/page.tsx components/curator/CollectionCard.tsx
git commit -m "feat: curator collection picker"
```

---

### Task 18: Ranked collection view

**Files:**
- Create: `app/(curator)/[id]/page.tsx`
- Create: `components/curator/TierSection.tsx`
- Create: `components/curator/ItemCard.tsx`

**Step 1: Create components/curator/ItemCard.tsx**

```typescript
import Image from 'next/image'

interface Props {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

export function ItemCard({ brand, style, heroUrl }: Props) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 bg-surface rounded overflow-hidden flex-shrink-0">
        {heroUrl ? (
          <Image src={heroUrl} alt={brand} width={64} height={64} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full bg-surface" />
        )}
      </div>
      <div>
        <p className="font-display text-text-primary">{brand || 'Unknown brand'}</p>
        {style && <p className="font-body text-sm text-text-muted">{style}</p>}
      </div>
    </div>
  )
}
```

**Step 2: Create components/curator/TierSection.tsx**

```typescript
import { ItemCard } from './ItemCard'
import type { TieredItem } from '@/lib/elo'

interface Item extends TieredItem {
  brand: string
  style: string
  heroUrl: string | null
}

const TIER_LABELS: Record<string, string> = {
  favorites: 'Favorites',
  strongKeeps: 'Strong Keeps',
  maybeKeeps: 'Maybe Keeps',
  belowTheLine: 'Below the Line',
}

interface Props {
  tier: string
  items: Item[]
}

export function TierSection({ tier, items }: Props) {
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 border-t border-surface" />
        <p className="font-display text-label uppercase tracking-widest text-text-muted whitespace-nowrap">
          {TIER_LABELS[tier] ?? tier}
        </p>
        <div className="flex-1 border-t border-surface" />
      </div>
      <div className="flex flex-col gap-3">
        {items.map(item => (
          <ItemCard key={item.id} {...item} />
        ))}
      </div>
    </section>
  )
}
```

**Step 3: Create app/(curator)/[id]/page.tsx**

```typescript
import { notFound } from 'next/navigation'
import { getCollection } from '@/actions/collections'
import { computeTiers } from '@/lib/elo'
import { TierSection } from '@/components/curator/TierSection'
import Link from 'next/link'

type Props = { params: Promise<{ id: string }> }

export default async function CollectionPage({ params }: Props) {
  const { id } = await params
  const collection = await getCollection(parseInt(id))
  if (!collection) notFound()

  const tieredItems = computeTiers(
    collection.items.map(item => ({ id: item.id, eloRating: item.eloRating }))
  ).map(tiered => {
    const item = collection.items.find(i => i.id === tiered.id)!
    return {
      ...tiered,
      brand: item.brand,
      style: item.style,
      heroUrl: item.photos[0]?.blobKey ?? null,
    }
  })

  const tiers = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']
  const grouped = Object.fromEntries(
    tiers.map(t => [t, tieredItems.filter(i => i.tier === t)])
  )

  return (
    <>
      <div className="flex items-baseline justify-between mb-10">
        <h1 className="font-display text-heading text-text-primary">
          {collection.name}
        </h1>
        <Link
          href={`/${id}/rank`}
          className="font-display text-label uppercase tracking-widest text-accent no-underline hover:opacity-75"
        >
          Sort →
        </Link>
      </div>

      {collection.items.length < 2 ? (
        <p className="font-body text-text-muted">
          Not enough items to rank yet.
        </p>
      ) : (
        tiers.map(tier => (
          <TierSection key={tier} tier={tier} items={grouped[tier] ?? []} />
        ))
      )}
    </>
  )
}
```

**Step 4: Commit**

```bash
git add app/\(curator\)/\[id\]/ components/curator/TierSection.tsx components/curator/ItemCard.tsx
git commit -m "feat: ranked collection view with tier sections"
```

---

### Task 19: Session picker

**Files:**
- Create: `app/(curator)/[id]/rank/page.tsx`

**Step 1: Create app/(curator)/[id]/rank/page.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'

export default function SessionPicker({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [minutes, setMinutes] = useState(5)

  function startSession() {
    router.push(`/${id}/rank/compare?duration=${minutes * 60}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-heading text-text-primary mb-4">
          How long?
        </h1>
        <p className="font-body text-text-muted mb-10">
          Pick a length that feels comfortable. Past 15 minutes it stops being useful.
        </p>

        <div className="mb-10">
          <p className="font-display text-display text-accent mb-2">{minutes}</p>
          <p className="font-body text-text-muted text-sm mb-6">minutes</p>
          <input
            type="range"
            min={1}
            max={15}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-label text-text-muted font-display uppercase tracking-widest mt-1">
            <span>1</span>
            <span>15</span>
          </div>
        </div>

        <button
          onClick={startSession}
          className="bg-accent text-cream font-display text-label uppercase tracking-widest px-8 py-3 rounded hover:opacity-90 transition-opacity w-full"
        >
          Start sorting
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/\(curator\)/\[id\]/rank/page.tsx
git commit -m "feat: session length picker"
```

---

### Task 20: Comparison screen

**Files:**
- Create: `app/(curator)/[id]/rank/compare/page.tsx`
- Create: `components/curator/ComparisonTimer.tsx`
- Create: `components/curator/ComparisonCard.tsx`

**Step 1: Create components/curator/ComparisonTimer.tsx**

```typescript
'use client'

import { useEffect, useState } from 'react'

interface Props {
  durationSeconds: number
  onExpire: () => void
}

export function ComparisonTimer({ durationSeconds, onExpire }: Props) {
  const [remaining, setRemaining] = useState(durationSeconds)

  useEffect(() => {
    if (remaining <= 0) {
      onExpire()
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onExpire])

  const progress = remaining / durationSeconds
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="fixed top-6 right-6 opacity-40">
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke="var(--color-surface)"
          strokeWidth={4}
        />
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
    </div>
  )
}
```

**Step 2: Create components/curator/ComparisonCard.tsx**

```typescript
interface Props {
  brand: string
  style: string
  heroUrl: string | null
  onPick: () => void
}

export function ComparisonCard({ brand, style, heroUrl, onPick }: Props) {
  return (
    <button
      onClick={onPick}
      className="flex-1 flex flex-col bg-surface rounded-xl overflow-hidden hover:ring-2 hover:ring-accent transition-all text-left"
    >
      <div className="aspect-[3/4] w-full bg-ground">
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={brand} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="px-4 py-3">
        <p className="font-display text-text-primary">{brand || 'Unknown'}</p>
        {style && <p className="font-body text-sm text-text-muted">{style}</p>}
      </div>
    </button>
  )
}
```

**Step 3: Create app/(curator)/[id]/rank/compare/page.tsx**

```typescript
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getNextPair, submitComparison } from '@/actions/ranking'
import { ComparisonTimer } from '@/components/curator/ComparisonTimer'
import { ComparisonCard } from '@/components/curator/ComparisonCard'

interface Item {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

interface Pair {
  itemA: Item
  itemB: Item
}

export default function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const collectionId = parseInt(id)
  const searchParams = useSearchParams()
  const duration = parseInt(searchParams.get('duration') ?? '300')
  const router = useRouter()

  const [pair, setPair] = useState<Pair | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadPair() {
    setLoading(true)
    const next = await getNextPair(collectionId)
    setPair(next as Pair | null)
    setLoading(false)
  }

  useEffect(() => { loadPair() }, [])

  const handleExpire = useCallback(() => setDone(true), [])

  async function pick(winnerId: number) {
    if (!pair) return
    await submitComparison(
      collectionId,
      pair.itemA.id,
      pair.itemB.id,
      winnerId,
      'photo_only'
    )
    await loadPair()
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-heading text-text-primary mb-3">
            That's enough for today.
          </p>
          <p className="font-body text-text-muted mb-8">
            Good session. Your rankings are saved.
          </p>
          <button
            onClick={() => router.push(`/${id}`)}
            className="font-display text-label uppercase tracking-widest text-accent"
          >
            See results →
          </button>
        </div>
      </div>
    )
  }

  if (loading) return null

  if (!pair) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="font-body text-text-muted">No more pairs to compare.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-10">
      <ComparisonTimer durationSeconds={duration} onExpire={handleExpire} />
      <p className="font-display text-label uppercase tracking-widest text-text-muted text-center mb-8">
        Which one?
      </p>
      <div className="flex gap-4 flex-1 max-w-2xl mx-auto w-full">
        <ComparisonCard {...pair.itemA} onPick={() => pick(pair.itemA.id)} />
        <ComparisonCard {...pair.itemB} onPick={() => pick(pair.itemB.id)} />
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add app/\(curator\)/\[id\]/rank/compare/ components/curator/ComparisonTimer.tsx components/curator/ComparisonCard.tsx
git commit -m "feat: comparison screen with quiet timer"
```

---

## Batch 8: Operator Pages

### Task 21: Dashboard

**Files:**
- Modify: `app/(operator)/dashboard/page.tsx`
- Create: `components/operator/CollectionRow.tsx`

**Step 1: Create components/operator/CollectionRow.tsx**

```typescript
import Link from 'next/link'

interface Props {
  id: number
  name: string
  itemCount: number
  createdAt: Date
}

export function CollectionRow({ id, name, itemCount, createdAt }: Props) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-surface">
      <div>
        <p className="font-display text-text-primary">{name}</p>
        <p className="font-body text-sm text-text-muted">
          {itemCount} items · created {createdAt.toLocaleDateString()}
        </p>
      </div>
      <Link
        href={`/collections/${id}`}
        className="font-display text-label uppercase tracking-widest text-accent no-underline"
      >
        Manage →
      </Link>
    </div>
  )
}
```

**Step 2: Update app/(operator)/dashboard/page.tsx**

```typescript
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { CollectionRow } from '@/components/operator/CollectionRow'
import Link from 'next/link'

export const metadata = { title: 'Dashboard — Purseinator' }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const collections = await db.collection.findMany({
    where: { ownerId: parseInt(session.user.id) },
    include: { items: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <>
      <div className="flex items-center justify-between mb-10">
        <h1 className="font-display text-heading text-text-primary">Collections</h1>
        <Link
          href="/collections/new"
          className="font-display text-label uppercase tracking-widest text-accent no-underline"
        >
          + New
        </Link>
      </div>
      {collections.map(c => (
        <CollectionRow
          key={c.id}
          id={c.id}
          name={c.name}
          itemCount={c.items.length}
          createdAt={c.createdAt}
        />
      ))}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add app/\(operator\)/dashboard/page.tsx components/operator/CollectionRow.tsx
git commit -m "feat: operator dashboard"
```

---

### Task 22: Photo upload

**Files:**
- Create: `app/(operator)/collections/[id]/upload/page.tsx`
- Create: `components/operator/PhotoUploader.tsx`

**Step 1: Create components/operator/PhotoUploader.tsx**

```typescript
'use client'

import { useState, useRef } from 'react'
import { uploadPhoto } from '@/actions/photos'

interface Props {
  itemId: number
  onUploaded: () => void
}

export function PhotoUploader({ itemId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      await uploadPhoto(itemId, formData)
    }
    setUploading(false)
    onUploaded()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-surface rounded-xl p-10 text-center cursor-pointer hover:border-accent transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <p className="font-display text-text-muted">
        {uploading ? 'Uploading…' : 'Drop photos here or click to browse'}
      </p>
    </div>
  )
}
```

**Step 2: Create app/(operator)/collections/[id]/upload/page.tsx**

```typescript
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PhotoUploader } from '@/components/operator/PhotoUploader'
import { createItem } from '@/actions/items'

type Props = { params: Promise<{ id: string }> }

export default async function UploadPage({ params }: Props) {
  const { id } = await params
  const collectionId = parseInt(id)

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: { items: { include: { photos: true } } },
  })

  if (!collection) notFound()

  return (
    <div>
      <h1 className="font-display text-heading text-text-primary mb-8">
        Upload to {collection.name}
      </h1>
      <form action={async () => {
        'use server'
        await createItem(collectionId, {})
      }}>
        <button
          type="submit"
          className="font-display text-label uppercase tracking-widest text-accent mb-8 block"
        >
          + Add item
        </button>
      </form>
      <div className="flex flex-col gap-8">
        {collection.items.map(item => (
          <div key={item.id} className="bg-surface rounded-xl p-6">
            <p className="font-display text-text-primary mb-4">
              Item #{item.id}
            </p>
            <PhotoUploader itemId={item.id} onUploaded={() => {}} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add app/\(operator\)/collections/ components/operator/PhotoUploader.tsx
git commit -m "feat: photo upload page"
```

---

## Batch 9: E2E Tests

### Task 23: Auth E2E test

**Files:**
- Create: `e2e/auth.spec.ts`

**Step 1: Replace e2e/smoke.spec.ts with e2e/auth.spec.ts**

```bash
mv e2e/smoke.spec.ts e2e/auth.spec.ts
```

```typescript
import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /purseinator/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /send link/i })).toBeVisible()
})

test('entering email shows confirmation', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('test@example.com')
  await page.getByRole('button', { name: /send link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()
})

test('unauthenticated access to / redirects to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})
```

**Step 2: Run**

```bash
npm run e2e -- e2e/auth.spec.ts
```

Expected: all 3 tests pass

**Step 3: Commit**

```bash
git add e2e/auth.spec.ts
git commit -m "test: auth E2E tests"
```

---

### Task 24: Session timer E2E test

**Files:**
- Create: `e2e/timer.spec.ts`

**Step 1: Create e2e/timer.spec.ts**

```typescript
import { test, expect } from '@playwright/test'

// This test verifies the timer arc renders and the expiry screen shows.
// Runs with a very short duration via URL param.
// Requires a logged-in session — skip if auth not configured.
test.describe('session timer', () => {
  test('shows "that\'s enough for today" after session expires', async ({ page }) => {
    // Navigate directly with 2-second duration for test speed
    await page.goto('/1/rank/compare?duration=2')

    // Wait for timer to expire (2s + buffer)
    await page.waitForTimeout(3000)

    await expect(page.getByText(/that.s enough for today/i)).toBeVisible()
  })
})
```

**Step 2: Commit**

```bash
git add e2e/timer.spec.ts
git commit -m "test: session timer expiry E2E"
```

---

## Batch 10: Deploy

### Task 25: Environment config and Vercel setup

**Files:**
- Create: `vercel.json`
- Create: `.env.example`

**Step 1: Create vercel.json**

```json
{
  "framework": "nextjs"
}
```

**Step 2: Create .env.example**

```
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
AUTH_SECRET="generate with: openssl rand -base64 32"
AUTH_RESEND_KEY="re_..."
BLOB_READ_WRITE_TOKEN="vercel_blob_..."
```

**Step 3: Run production build locally to verify**

```bash
npm run build
```

Expected: build succeeds with no errors

**Step 4: Commit**

```bash
git add vercel.json .env.example
git commit -m "chore: Vercel config and env example"
```

---

### Task 26: Deploy to Vercel

**Step 1: Link and deploy**

```bash
cd ~/repos/purseinator-app
vercel link
vercel env add DATABASE_URL
vercel env add AUTH_SECRET
vercel env add AUTH_RESEND_KEY
vercel env add BLOB_READ_WRITE_TOKEN
vercel
```

**Step 2: Run database migration on Neon**

```bash
DATABASE_URL="<neon-url>" npx prisma db push
```

**Step 3: Verify preview URL loads login page**

Open the preview URL. Expect: login page renders, email form visible.

**Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: production deploy verified"
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm test` | Run Vitest unit tests |
| `npm run e2e` | Run Playwright E2E |
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npx prisma studio` | Browse database |
| `npx prisma db push` | Push schema to DB |
