# Adored — Curatorial Collection Sorting App

A full-featured web application for managing collections and sorting items through guided preference sessions. Built with Next.js 14, TypeScript, Drizzle ORM, and Tailwind CSS.

> **Architecture & project history:** see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current architecture, how the project got here, the decisions log, and the roadmap.

## Features

- **Collections Management** — Create and manage curated collections with team members
- **Role-Based Authorization** — Two derived roles (owner + curator) enforced at a single DAL capability chokepoint
- **Photo Management** — Upload and manage item photos with hero photo support
- **Preference Sorting** — Multi-phase sorting sessions (triage → pairwise → results)
- **Decision Tracking** — Append-only decision events as source of truth
- **Result Generation** — Automatic ranking with manual override capability
- **Public Sharing** — Generate shareable public links for viewing results
- **Email Invitations** — Invite team members with expiring tokens

## Local Development

### Prerequisites

- **Node.js 22+** (`engines` requires `>=22.12`)
- **PostgreSQL 14+** (local or Docker)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repo>
   cd purseinator-app
   npm install
   ```

2. **Create `.env.local` with database credentials:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your local Postgres credentials
   ```

   Example for local PostgreSQL:
   
   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5432/adored
   AUTH_URL=http://localhost:3000
   AUTH_SECRET=$(openssl rand -base64 32)
   EMAIL_FROM=noreply@localhost
   # Optional locally — each degrades gracefully when unset:
   RESEND_API_KEY=            # transactional email (magic-link + invites); unset → dev logs the link
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=  # analytics + DB observability; unset → capture is skipped
   ```

   > Auth uses the Vercel-style `AUTH_URL`/`AUTH_SECRET` names; `src/lib/env.ts` validates these and bridges them to NextAuth v4's internal `NEXTAUTH_URL`/`NEXTAUTH_SECRET` at runtime. Do **not** put Vercel system vars (`VERCEL`, `VERCEL_ENV`, …) in `.env.local` — see the `__Secure-` cookie note in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the full operator variable list, see [docs/runbooks/setup-checklist.md](docs/runbooks/setup-checklist.md).

3. **Set up PostgreSQL database:**
   ```bash
   # Using Postgres.app or brew
   createdb adored

   # Using Docker
   docker run -d \
     -e POSTGRES_PASSWORD=password \
     -e POSTGRES_DB=adored \
     -p 5432:5432 \
     postgres:15
   ```

4. **Generate migrations from schema:**
   ```bash
   npm run db:generate
   ```

5. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

### Development Commands

**App**
- `npm run dev` — Start the Next.js dev server with hot reload
- `npm run dev:tutorial` — Open the onboarding walkthrough at `/tutorial` for local preview/iteration (dev-only)
- `npm run build` — Build for production (`next build`)
- `npm start` — Run the production build (`next start`)
- `npm run lint` — Run ESLint over `.ts`/`.tsx`

**Testing**
- `npm test` — Run Vitest unit tests (watch mode)
- `npm run test:ci` — Run Vitest once, non-interactive (`vitest run --passWithNoTests`)
- `npm run test:db` — Run the DB-backed integration tests (Docker Postgres; `RUN_DB_TESTS=1`)
- `npm run test:ui` — Run Vitest with the browser UI
- `npm run test:e2e` — Run the Playwright end-to-end suite
- `npm run test:e2e:ui` — Run Playwright with the interactive UI runner
- `npm run test:e2e:report` — Open the last Playwright HTML report
- `npm run screenshots` — Capture UI screenshots via the Playwright screenshots config

**Database**
- `npm run db:generate` — Generate Drizzle migrations from the schema
- `npm run db:migrate` — Apply pending migrations
- `npm run db:backfill-slugs` — Backfill collection slugs on existing rows
- `npm run db:backfill-numbers` — Backfill sequential session/result numbers

**Utilities**
- `npm run auth:verify` — Verify the auth env/config wiring
- `npm run seed:load` — Load demo/seed data into the database
- `npm run bench:recompute` — Benchmark the preference-recompute path

### Testing Features Locally

**Sign In:**
- Email + password is the primary sign-in; a passwordless magic-link is also available
- Transactional email is sent via Resend (`src/lib/email.ts`) — set `RESEND_API_KEY` to send for real
- With no key in development, the magic-link / invite URL is logged to the server console so you can click it locally

**Photos:**
- Storage is Vercel Blob — set `BLOB_READ_WRITE_TOKEN` to enable uploads
- With no Blob token in dev, a fallback serves the committed seed/demo images from `e2e/fixtures/demo-images/` (see `src/lib/photo-serving.ts`); real uploads require the token
- Images are resized on demand and re-encoded to WebP via `sharp`

**Invitations:**
- Create collection → Members tab → Invite by email
- Invitation links work immediately with local email

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and routes
│   ├── api/               # API endpoints
│   ├── collections/       # Collections management pages
│   ├── invitations/       # Public invitation acceptance
│   ├── login/             # Authentication pages
│   └── ...
├── components/            # React components
│   ├── ui/               # Primitive UI components (Button, Input, etc.)
│   ├── layout/           # Layout components (Header, AppLayout, etc.)
│   └── ...
├── features/             # Feature-specific components
├── server/               # Server-side code
│   ├── api/             # API controllers
│   ├── services/        # Business logic services
│   ├── repositories/    # Data access layer
│   └── ...
├── lib/                 # Shared utilities
│   ├── db/             # Database config and schema
│   ├── auth.ts         # Authentication utilities
│   └── api-client.ts   # Typed API client for client components
└── types/              # Shared TypeScript types
```

## Architecture

**Service-First Design:**
- Domain services contain business logic (MembershipService, PhotoService, etc.)
- Repositories provide data access (CollectionRepository, ItemRepository, etc.)
- Controllers handle HTTP request/response mapping
- Page components fetch data and render UI

**Type Safety:**
- Full TypeScript with strict mode
- Drizzle ORM for type-safe database access
- Zod validation for API inputs
- Domain types in `src/types/domain.ts`

**Authentication:**
- NextAuth v4 — **email + password (Credentials)** is the primary sign-in; an email **magic-link** provider is also wired, sending via Resend (`src/lib/email.ts`; set `RESEND_API_KEY`)
- JWT session strategy (not database sessions)
- Authorization is enforced at the **DAL capability chokepoint** (`requireApiCapability`), not a client hook — see the Permissions section below
- A migration to [better-auth](https://www.better-auth.com/) (email + Google + magic-link) is planned (bead `purses-74tx`) but not yet done

**UI:**
- Tailwind CSS for styling
- CVA (class-variance-authority) for component variants
- Tablet-first, tap-friendly design (44px minimum tap targets)
- Responsive grid layouts

## Database Schema

The Drizzle schema (`src/lib/db/schema.ts`) defines 17 tables. The core domain tables:
- **collections** — Curated collections with metadata
- **items** — Collection items (handbags, shoes, etc.)
- **photos** — Item photos with hero photo support
- **memberships** — Collection team members; a `role` label column (owner/curator is derived, not stored as flags — see Permissions)
- **sessions** — Sorting sessions with decision tracking
- **decision_events** — Append-only decision events (triage, pairwise)
- **item_dispositions** — per-curator triage shelving (`set_aside` / `deferred`); parks an untriaged item out of the sort queue
- **sort_results** / **sort_result_items** / **sort_result_shares** — finalized rankings + tokenized public shares
- **collection_preference_items** — per-curator computed preferences
- **invitations** — Email invitations with expiring tokens
- plus the NextAuth tables (**user**, **account**, **session**, **verification_token**)

All tables include soft-delete support (`deletedAt` column) for data safety.

## Permissions

**Two roles, owner + curator, both derived (never stored as authorization state):**

- **owner** — the caller iff `collection.ownerId === userId`
- **curator** — the caller has a membership row for the collection (`membership.role` is a display label only; it is never read for authorization)

Authorization is a compile-exhaustive `CAPABILITIES: Record<Operation, Role>` map (`src/server/dal/capabilities.ts`) enforced at a **single chokepoint**, `requireApiCapability` (`src/server/dal/collection-access.ts`): resolve the collection → derive the effective role → look up the operation's required role → allow or return a 403/404. `owner` satisfies every operation; `curator` satisfies only curator-level ones.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (decision 17) and [docs/teaching/authorization.md](docs/teaching/authorization.md) for the full model.

## Deployment

### Vercel (Recommended)

The app is optimized for Vercel with native integrations:

1. **Push to GitHub** and connect to Vercel
2. **Environment Variables:**
   ```
   DATABASE_URL=<neon-postgres-connection-string>
   AUTH_URL=https://yourdomain.vercel.app
   AUTH_SECRET=<generated-secret>
   BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
   RESEND_API_KEY=<resend-api-key>                     # transactional email
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<posthog-token>   # analytics + DB observability
   ```

   See [docs/runbooks/setup-checklist.md](docs/runbooks/setup-checklist.md) for the full operator variable list.
3. **Deploy** — Vercel auto-detects Next.js and builds

### Self-Hosted

- Docker-ready (create `Dockerfile` from Next.js docs)
- Supports any PostgreSQL database
- Blob storage required for photo uploads (configure Vercel Blob or S3)

## Known Limitations

- **Email Provider:** Sends via Resend (`RESEND_API_KEY`); with no key, dev logs the link to the console
- **Photo Storage:** Vercel Blob (`BLOB_READ_WRITE_TOKEN`); with no token, dev serves the seed/demo fixtures from `e2e/fixtures/demo-images/` — real uploads require the token

## Contributing

- Run `npm run lint` before committing
- All TypeScript must pass `npx tsc --noEmit`
- Add tests for new features using Vitest
- Follow existing code patterns and naming conventions

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** NextAuth v4
- **Styling:** Tailwind CSS + CVA
- **Validation:** Zod
- **Testing:** Vitest (unit + DB integration) + Playwright (e2e, with axe-core a11y)
- **Blob Storage:** Vercel Blob
- **Image Processing:** sharp (on-demand resize → WebP)
- **Email:** Resend (transactional)
- **Analytics & Observability:** PostHog (product analytics + DB observability), Vercel Analytics + Speed Insights
- **ID Generation:** ULID

## License

Private project.
