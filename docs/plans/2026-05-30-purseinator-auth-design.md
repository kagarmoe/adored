# PurseInator Authentication System Design

**Date:** 2026-05-30  
**Status:** Design approved, ready for implementation  
**Scope:** Canonical NextAuth v4 + Drizzle adapter with email/password + magic links

---

## 1. Overview

Authentication uses **NextAuth v4 with `@auth/drizzle-adapter`** following Next.js canonical patterns. Users can sign in with:
- **Email + password** (credentials provider)
- **Magic link** (email provider)

This aligns with wireframe UX (email/password primary, magic link secondary) while following NextAuth's opinionated database schema.

---

## 2. Database Schema (Canonical NextAuth)

All tables follow `@auth/drizzle-adapter` expectations exactly:

### `user` table (renamed from `users`)
```
id                TEXT PRIMARY KEY
email             TEXT UNIQUE NOT NULL
emailVerified     TIMESTAMP
name              TEXT
image             TEXT
password          TEXT (for credentials provider)
```

**Migration:** Rename existing `users` table to `user`, add `password` and `emailVerified` fields, remove soft-delete support (handled differently — see below).

### `account` table
```
userId            TEXT FK → user.id
type              TEXT (e.g., "credentials", "email")
provider          TEXT (e.g., "credentials", "email")
providerAccountId TEXT
refresh_token     TEXT
access_token      TEXT
expires_at        BIGINT
token_type        TEXT
scope             TEXT
id_token          TEXT
PRIMARY KEY (provider, providerAccountId)
```

Stores OAuth account linkage (for future multi-provider support).

### `session` table
```
sessionToken      TEXT PRIMARY KEY
userId            TEXT FK → user.id
expires           TIMESTAMP NOT NULL
```

Database-backed session storage. Adapter manages lifecycle.

### `verificationToken` table
```
identifier        TEXT
token             TEXT UNIQUE NOT NULL
expires           TIMESTAMP NOT NULL
PRIMARY KEY (identifier, token)
```

Stores magic link tokens. NextAuth adapter manages TTL and cleanup.

---

## 3. Authentication Providers

### Credentials Provider (Email + Password)

**Purpose:** Sign in with email/password, create account with password

**Config:**
```typescript
credentials: {
  email: { label: "Email", type: "email" },
  password: { label: "Password", type: "password" }
}
```

**Flow:**
- Validates email + password against `user.password` (bcrypt)
- Creates user on first login if doesn't exist
- Returns JWT + stores session in database

**Security:**
- Passwords hashed with bcrypt (NextAuth default)
- Stored in `user.password` column
- Never logged or exposed

### Email Provider (Magic Links)

**Purpose:** Sign in or create account via magic link, forgot password recovery

**Config:**
```typescript
EmailProvider({
  server: process.env.EMAIL_SERVER_HOST,
  from: process.env.EMAIL_FROM,
  sendVerificationRequest: async ({ identifier, url }) => {
    // Send magic link to identifier (email)
  }
})
```

**Flow:**
- User enters email
- NextAuth generates token, stores in `verificationToken` table
- Sends magic link via email
- User clicks link → `verificationToken` verified → user created/logged in
- Session created in `session` table

**Token TTL:** 24 hours (configurable via adapter)

---

## 4. User Flows

### New User (Credentials/Password Path)

1. User lands on `/login`, clicks "Create an account" link
2. Redirected to `/signup`
3. Enter email → submit
4. Prompted to set password
5. Password set → account created, logged in
6. Redirect to `/collections`

### New User (Magic Link Path)

1. User lands on `/login`, enters email, clicks "Email me a magic link"
2. Email sent with magic link
3. User clicks link in email
4. Lands on callback → session created
5. Redirect to `/collections`

### Returning User (Password)

1. On `/login`, enter email + password
2. Submit → validated via credentials provider
3. Session created in `session` table
4. Redirect to `/collections`

### Returning User (Forgot Password / Prefers Magic Link)

1. On `/login`, click "Email me a magic link"
2. Enter email → submit
3. Magic link sent
4. Click link → logged in (no password needed)
5. Redirect to `/collections`

---

## 5. Implementation Architecture

### NextAuth Configuration

**File:** `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import EmailProvider from "next-auth/providers/email"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { getDb } from "@/lib/db"

export const authOptions = {
  adapter: DrizzleAdapter(getDb()),
  providers: [
    Credentials({
      async authorize(credentials) {
        // Validate email + password against db
      }
    }),
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      return session
    }
  },
  pages: { signIn: "/login" }
}
```

### Login Page

**File:** `src/app/login/page.tsx`

- Email input
- Password input
- "Sign in" button (credentials provider)
- "Email me a magic link" button (email provider)
- "Create an account" link → `/signup`

### Signup Page

**File:** `src/app/auth/signup/page.tsx`

- Email input
- Option 1: "Create with password" → password input → submit
- Option 2: "Create with magic link" → email → magic link sent
- Magic link callback creates user + sets password later (optional)

### Protected Routes

**Middleware:** `src/middleware.ts`

```typescript
export async function middleware(request) {
  const session = await getServerSession(authOptions)
  if (!session && protectedRoute(request)) {
    return redirect("/login")
  }
}
```

**API Routes:** All protected routes check session:

```typescript
const session = await requireAuth() // throws if no session
const user = session.user
```

---

## 6. Session Management

- **Storage:** Database (`session` table) via `@auth/drizzle-adapter`
- **Token:** JWT in httpOnly cookie (NextAuth default)
- **Expiration:** 30 days (configurable)
- **Revocation:** Delete from `session` table on logout

---

## 7. Soft-Delete Handling

NextAuth adapter doesn't support soft-delete on `user` table (NextAuth expects hard deletes). For PurseInator's soft-delete requirement:

**Option A:** Track soft-deletes via separate `deletedUsers` table or flag

**Option B:** Remove soft-delete from `user`, keep on other tables (`collections`, `items`, etc.)

**Recommended:** Option B — user soft-delete is rare, hard-delete is simpler with NextAuth.

---

## 8. Migration Path

1. Create new `user`, `account`, `session`, `verificationToken` tables (NextAuth schema)
2. Migrate data from `users` → `user`
3. Drop old `users` table
4. Deploy auth configuration
5. Test locally and production

---

## 9. Email Configuration

**Development:**
- Console logging of magic links
- Configurable via `EMAIL_SERVER_HOST`, `EMAIL_FROM`
- Default: localhost:1025 (MailHog)

**Production (Vercel):**
- Resend email provider recommended
- Set `EMAIL_SERVER`, `EMAIL_FROM` env vars
- NextAuth handles API calls

---

## 10. Success Criteria

- ✅ Email/password login works locally
- ✅ Magic links work locally (logged to console)
- ✅ Account creation works
- ✅ Sessions persist in database
- ✅ Protected routes redirect to `/login` if unauthenticated
- ✅ `GET /users/me` returns authenticated user
- ✅ Works locally with Postgres + migrations
- ✅ Production-ready for Vercel

---

## 11. Related Specs

- **API Spec:** `/docs/purseinator_mvp_api_spec.md` — Sessions managed via `getServerSession(authOptions)`
- **Wireframes:** Email/password + magic link UX
- **Design Doc:** `2026-05-29-purseinator-complete-refactor-design.md` — NextAuth specified for auth

---

**Next:** Implementation plan via superpowers:writing-plans
