import { headers } from "next/headers";
import { auth } from "@/lib/auth-server";

export interface Session {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

const DEV_AUTH_BYPASS_EMAIL = "dev@adored.test";
const DEV_AUTH_BYPASS_NAME = "Dev User";

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1";
}

async function getDevBypassSession(): Promise<Session> {
  const [{ eq }, { getDb }, { user: userTable }, { generateId }] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("@/lib/id"),
  ]);
  const db = getDb();
  const email = process.env.AUTH_BYPASS_EMAIL || DEV_AUTH_BYPASS_EMAIL;
  const name = process.env.AUTH_BYPASS_NAME || DEV_AUTH_BYPASS_NAME;

  const existing = await db
    .select({ id: userTable.id, email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (existing.length) {
    return { user: existing[0] };
  }

  const [created] = await db
    .insert(userTable)
    .values({
      id: process.env.AUTH_BYPASS_USER_ID || generateId("user"),
      email,
      name,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: userTable.email })
    .returning({ id: userTable.id, email: userTable.email, name: userTable.name });

  if (created) {
    return { user: created };
  }

  const [raced] = await db
    .select({ id: userTable.id, email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (!raced) {
    throw new Error("Unable to create dev auth bypass user");
  }
  return { user: raced };
}

// THE FAÇADE (Cutover Pass 1). Reads a better-auth session and returns the
// byte-identical shape the ~249 call sites + the DAL (`userId: string`) already
// depend on: { user: { id, email, name } }. better-auth's getSession returns
// { session, user } | null; we project ONLY id/email/name off `user` so no
// extra fields (image/emailVerified/…) leak into the contract. Because we have
// NOT enabled session.cookieCache, auth.api.getSession does a fresh per-request
// DB read — so a profile display-name edit is reflected on the very next call
// (name-freshness) with no stale JWT claim to invalidate.
//
// NextAuth is fully retired (Cutover Pass 2b-i): the old authOptions +
// Credentials/EmailProvider/DrizzleAdapter config is gone, and better-auth now
// owns the whole sign-in/session surface at /api/auth. This module is nothing
// but the read façade over better-auth.
export async function getSession(): Promise<Session | null> {
  if (isDevAuthBypassEnabled()) {
    return getDevBypassSession();
  }

  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) {
    return null;
  }
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
  };
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAuth(): Promise<{ id: string; email: string; name?: string }> {
  const session = await getSession();
  if (!session?.user) {
    throw new UnauthorizedError("Unauthorized");
  }
  return session.user;
}
