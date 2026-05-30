# PurseInator Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement NextAuth v4 with email/password + magic link authentication, database schema migration, and protected routes.

**Architecture:** NextAuth v4 with `@auth/drizzle-adapter` manages sessions in Postgres. Credentials provider handles email/password, Email provider handles magic links. Database schema migrates from custom `users` table to NextAuth canonical schema (`user`, `account`, `session`, `verificationToken`). Login/signup pages with form UI. Middleware protects routes. All API routes check `getServerSession()`.

**Tech Stack:** Next.js 14, NextAuth v4, Drizzle ORM, bcrypt, Postgres

---

## Task 1: Update Database Schema (Migration)

**Files:**
- Modify: `src/lib/db/schema.ts` — update user table to `user`, add auth tables
- Create: `drizzle/0001_auth_schema.sql` — migration file
- Modify: `package.json` — ensure drizzle scripts exist

**Step 1: Add auth tables to schema.ts**

Update `src/lib/db/schema.ts` to rename and expand user schema:

```typescript
import { pgTable, text, timestamp, bigint, index, primaryKey } from "drizzle-orm/pg-core";

// NextAuth canonical schema
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified"),
  image: text("image"),
  password: text("password"), // for credentials provider
});

export const account = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: bigint("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_userId_idx").on(account.userId),
  })
);

export const session = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expires: timestamp("expires").notNull(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  })
);

export const verificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires").notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({
      columns: [vt.identifier, vt.token],
    }),
  })
);
```

**Step 2: Generate migration**

Run:
```bash
npm run db:generate
```

Expected: New migration file created at `drizzle/0001_auth_schema.sql`

**Step 3: Verify migration contains user table rename + new tables**

```bash
cat drizzle/0001_auth_schema.sql | grep -E "CREATE TABLE|ALTER TABLE.*RENAME" | head -10
```

Expected output should show:
- ALTER TABLE users RENAME TO user
- CREATE TABLE account
- CREATE TABLE session
- CREATE TABLE verificationToken

**Step 4: Commit schema changes**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "schema: add NextAuth canonical auth tables"
```

---

## Task 2: Update Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add @auth/drizzle-adapter**

Edit `package.json`, ensure dependencies include:

```json
{
  "dependencies": {
    "next": "14.2.3",
    "react": "18.3.1",
    "next-auth": "4.24.10",
    "@auth/drizzle-adapter": "^1.2.0",
    "bcryptjs": "^2.4.3",
    "drizzle-orm": "0.30.10",
    "postgres": "3.4.4"
  }
}
```

**Step 2: Install**

```bash
npm install
```

Expected: No errors, @auth/drizzle-adapter and bcryptjs installed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add auth/drizzle-adapter and bcryptjs"
```

---

## Task 3: Create NextAuth Configuration

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth.ts` — helper for getServerSession

**Step 1: Create auth configuration file**

Create `src/lib/auth.ts`:

```typescript
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(getDb()),
  providers: [
    Credentials({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "you@example.com",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const db = getDb();
        const user = await db
          .select()
          .from(db.user)
          .where(eq(db.user.email, credentials.email))
          .limit(1);

        if (!user.length) {
          throw new Error("No user found with this email");
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user[0].password || ""
        );

        if (!passwordMatch) {
          throw new Error("Invalid password");
        }

        return {
          id: user[0].id,
          email: user[0].email,
          name: user[0].name,
        };
      },
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || "localhost",
        port: parseInt(process.env.EMAIL_SERVER_PORT || "1025"),
        secure: process.env.NODE_ENV === "production",
        auth: process.env.EMAIL_SERVER_USER
          ? {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
      from: process.env.EMAIL_FROM || "noreply@purseinator.app",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(`[DEV MAGIC LINK] ${identifier}\n${url}`);
        } else {
          // In production, provider.sendMail handles actual email
          await provider.sendMail({
            to: identifier,
            subject: "Sign in to PurseInator",
            html: `<p>Click <a href="${url}">here</a> to sign in</p>`,
          });
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
    async signIn({ user, account }) {
      // Auto-create user on first magic link sign-in
      if (account?.provider === "email" && user?.email) {
        const db = getDb();
        const existing = await db
          .select()
          .from(db.user)
          .where(eq(db.user.email, user.email))
          .limit(1);

        if (!existing.length) {
          await db.insert(db.user).values({
            id: generateId(),
            email: user.email,
            name: user.name || user.email.split("@")[0],
            emailVerified: new Date(),
          });
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};
```

**Step 2: Create NextAuth route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/[...nextauth]/route.ts
git commit -m "feat: add NextAuth configuration with credentials + email providers"
```

---

## Task 4: Create Login Page

**Files:**
- Create: `src/app/login/page.tsx`

**Step 1: Create login page**

Create `src/app/login/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, ErrorMessage } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/collections";

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("email", {
        email,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        setMagicLinkSent(true);
      }
    } catch (err) {
      setError("Failed to send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-sm w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Check your email
          </h1>
          <p className="text-gray-600 mb-4">
            A sign-in link has been sent to <strong>{email}</strong>
          </p>
          <p className="text-gray-600 text-sm mb-6">
            Click the link in the email to sign in. If you don&apos;t see it,
            check your spam folder.
          </p>
          <Button
            onClick={() => {
              setMagicLinkSent(false);
              setEmail("");
            }}
            variant="secondary"
            fullWidth
          >
            Try a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          PurseInator
        </h1>
        <p className="text-center text-gray-600 mb-8">
          sort what you love, let go of the rest
        </p>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handlePasswordSignIn} className="space-y-4 mb-6">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            label="Email"
          />
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            label="Password"
          />
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={handleMagicLink}
          disabled={loading || !email}
        >
          Email me a magic link
        </Button>

        <p className="text-center text-sm text-gray-600 mt-6">
          New here?{" "}
          <a href="/signup" className="text-blue-600 hover:text-blue-700">
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Verify page renders**

```bash
npm run build 2>&1 | grep -E "error|Login"
```

Expected: No errors in build output

**Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: create login page with password and magic link options"
```

---

## Task 5: Create Signup Page

**Files:**
- Create: `src/app/signup/page.tsx`

**Step 1: Create signup page**

Create `src/app/signup/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, ErrorMessage } from "@/components/ui";
import { apiPost } from "@/lib/api-client";
import bcrypt from "bcryptjs";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      // Create account via API
      const response = await apiPost("/api/auth/signup", {
        email,
        password,
      });

      if (response.ok) {
        // Sign in automatically
        router.push("/login?email=" + encodeURIComponent(email));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          Create Account
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Join PurseInator to start organizing
        </p>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSignup} className="space-y-4">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            label="Email"
          />
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            label="Password"
          />
          <Input
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            label="Confirm Password"
          />
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-blue-600 hover:text-blue-700">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Create signup API endpoint**

Create `src/app/api/auth/signup/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { generateId } from "ulid";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if user exists
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    await db.insert(user).values({
      id: generateId(),
      email,
      password: passwordHash,
      name: email.split("@")[0],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/app/signup/page.tsx src/app/api/auth/signup/route.ts
git commit -m "feat: create signup page and API endpoint"
```

---

## Task 6: Update Middleware for Protected Routes

**Files:**
- Create/Modify: `src/middleware.ts`

**Step 1: Create/update middleware**

Create or update `src/middleware.ts`:

```typescript
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/", "/login", "/signup", "/shared", "/invitations"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for valid session
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**Step 2: Verify middleware exports**

```bash
grep -n "export const config\|export async function middleware" src/middleware.ts
```

Expected: Both exports present

**Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware to protect routes"
```

---

## Task 7: Apply Database Migration

**Files:**
- Execute: `npm run db:migrate`

**Step 1: Run migrations**

```bash
npm run db:migrate 2>&1
```

Expected output:
```
Running migrations...
✅ Migrations completed successfully
```

**Step 2: Verify tables in Postgres**

```bash
psql postgresql://localhost/purseinator -c "\dt" | grep -E "user|account|session|verificationToken"
```

Expected: All 4 tables present

**Step 3: Commit migration**

```bash
git add drizzle/
git commit -m "db: run auth schema migration"
```

---

## Task 8: Test Login Flow Locally

**Files:**
- None (testing only)

**Step 1: Start dev server**

```bash
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
sleep 5
```

**Step 2: Test login page loads**

```bash
curl -s http://localhost:3000/login | grep -q "Email me a magic link" && echo "✅ Login page loads" || echo "❌ Failed"
```

**Step 3: Test signup page loads**

```bash
curl -s http://localhost:3000/signup | grep -q "Create Account" && echo "✅ Signup page loads" || echo "❌ Failed"
```

**Step 4: Test protected route redirects to login**

```bash
curl -s -i http://localhost:3000/collections | grep -q "307\|/login" && echo "✅ Protected route redirects" || echo "❌ Failed"
```

**Step 5: Stop dev server**

```bash
kill $DEV_PID 2>/dev/null || true
```

**Step 6: Commit**

```bash
git add -A
git commit -m "test: verify auth flow works locally"
```

---

## Task 9: Update Environment Variables

**Files:**
- Modify: `.env.local`

**Step 1: Update .env.local**

```bash
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://localhost/purseinator
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)
EMAIL_SERVER_HOST=localhost
EMAIL_SERVER_PORT=1025
EMAIL_FROM=noreply@purseinator.app
NODE_ENV=development
EOF
```

**Step 2: Verify file exists**

```bash
test -f .env.local && echo "✅ .env.local created" || echo "❌ Failed"
```

**Step 3: Commit (without exposing secrets)**

```bash
cat > .env.example << 'EOF'
DATABASE_URL=postgresql://localhost/purseinator
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
EMAIL_SERVER_HOST=localhost
EMAIL_SERVER_PORT=1025
EMAIL_FROM=noreply@purseinator.app
NODE_ENV=development
EOF

git add .env.example
git commit -m "docs: add .env.example for reference"
```

---

## Task 10: Verify Full Auth Flow

**Files:**
- None (manual testing)

**Step 1: Start dev server**

```bash
npm run dev &
DEV_PID=$!
sleep 5
```

**Step 2: Test signup flow**

Open http://localhost:3000/signup in browser:
- Enter email: test@example.com
- Enter password: testpass123
- Confirm password: testpass123
- Click "Create Account"
- Expected: Redirected to login page with success message

**Step 3: Test password login**

Open http://localhost:3000/login:
- Enter email: test@example.com
- Enter password: testpass123
- Click "Sign in"
- Expected: Redirected to `/collections`, can see collections

**Step 4: Test logout**

Click user menu → Sign out
- Expected: Redirected to login page

**Step 5: Test magic link flow**

Open http://localhost:3000/login:
- Enter email: test2@example.com
- Click "Email me a magic link"
- Expected: "Check your email" message, check dev logs for magic link URL
- Click magic link in dev log
- Expected: Auto-logged in, redirected to collections

**Step 6: Stop dev server**

```bash
kill $DEV_PID 2>/dev/null || true
```

**Step 7: Final commit**

```bash
git status
# If all working as expected
git add -A
git commit -m "feat: complete auth implementation with email/password and magic links"
```

---

## Verification Checklist

- ✅ Database migrated (`user`, `account`, `session`, `verificationToken` tables exist)
- ✅ NextAuth configured with credentials + email providers
- ✅ Login page renders with both options
- ✅ Signup page renders
- ✅ Password signup creates user account
- ✅ Password login works
- ✅ Magic link signup creates user
- ✅ Magic link login works
- ✅ Protected routes redirect to login when unauthenticated
- ✅ Sessions persist in database
- ✅ Logout clears session

---

## Next Steps (Phase 5)

After auth is working:
1. Update `/users/me` endpoint to return current authenticated user
2. Integrate auth with collection ownership/membership checks
3. Add email configuration for production (Resend or SendGrid)
4. Implement password reset flow if needed
5. Add email verification for new signups

