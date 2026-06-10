# Adored — Curatorial Collection Sorting App

A full-featured web application for managing collections and sorting items through guided preference sessions. Built with Next.js 14, TypeScript, Drizzle ORM, and Tailwind CSS.

## Features

- **Collections Management** — Create and manage curated collections with team members
- **Permission-Based Authorization** — Fine-grained, boolean-flag permissions (not roles)
- **Photo Management** — Upload and manage item photos with hero photo support
- **Preference Sorting** — Multi-phase sorting sessions (triage → pairwise → results)
- **Decision Tracking** — Append-only decision events as source of truth
- **Result Generation** — Automatic ranking with manual override capability
- **Public Sharing** — Generate shareable public links for viewing results
- **Email Invitations** — Invite team members with expiring tokens

## Local Development

### Prerequisites

- **Node.js 20+**
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
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=$(openssl rand -base64 32)
   EMAIL_FROM=noreply@localhost
   ```

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

- `npm run dev` — Start Next.js dev server with hot reload
- `npm run build` — Build for production
- `npm start` — Run production build
- `npm run lint` — Run ESLint
- `npm test` — Run Vitest unit tests
- `npm run test:ui` — Run Vitest with UI
- `npm run db:generate` — Generate database migrations from schema
- `npm run db:migrate` — Apply pending migrations

### Testing Features Locally

**Sign In:**
- Click "Sign In" → enter any email
- In development, the email provider uses your EMAIL_FROM setting
- For real email, configure SMTP via environment variables (Resend recommended)

**Photos:**
- Blob storage configured for Vercel but disabled in local dev
- Photos upload to `public/uploads/` directory locally
- Set `BLOB_READ_WRITE_TOKEN` to enable Vercel Blob in production

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
- NextAuth v4 with email magic-link provider
- Session-based auth with JWT tokens
- Permission checks via `usePermissions()` hook

**UI:**
- Tailwind CSS for styling
- CVA (class-variance-authority) for component variants
- Tablet-first, tap-friendly design (44px minimum tap targets)
- Responsive grid layouts

## Database Schema

8 tables with full relationships:
- **collections** — Curated collections with metadata
- **items** — Collection items (handbags, shoes, etc.)
- **photos** — Item photos with hero photo support
- **members** — Collection team members with 8 permission flags
- **sessions** — Sorting sessions with decision tracking
- **decisions** — Append-only decision events (triage, pairwise)
- **results** — Finalized sorting results with ranking
- **invitations** — Email invitations with expiring tokens

All tables include soft-delete support (`deletedAt` column) for data safety.

## Permissions

8 granular boolean flags (not roles):
- `canManageCollection` — Full collection management
- `canInviteMembers` — Invite new members
- `canAddItems` — Add items to collection
- `canEditMetadata` — Edit item metadata
- `canAddPhotos` — Upload item photos
- `canDeletePhotos` — Delete photos
- `canSort` — Participate in sort sessions
- `canViewOutputs` — View final results
- `canDeleteItems` — Delete items from collection

## Deployment

### Vercel (Recommended)

The app is optimized for Vercel with native integrations:

1. **Push to GitHub** and connect to Vercel
2. **Environment Variables:**
   ```
   DATABASE_URL=<neon-postgres-connection-string>
   NEXTAUTH_URL=https://yourdomain.vercel.app
   NEXTAUTH_SECRET=<generated-secret>
   BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
   ```
3. **Deploy** — Vercel auto-detects Next.js and builds

### Self-Hosted

- Docker-ready (create `Dockerfile` from Next.js docs)
- Supports any PostgreSQL database
- Blob storage required for photo uploads (configure Vercel Blob or S3)

## Known Limitations

- **Email Provider:** Configure via environment variables or use Resend
- **Photo Storage:** Vercel Blob in production; local file system in dev
- **Blob Token:** Leave empty in local dev to skip photo uploads

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
- **Testing:** Vitest
- **Blob Storage:** Vercel Blob
- **ID Generation:** ULID

## License

Private project.
