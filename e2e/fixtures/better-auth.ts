// Shared better-auth e2e helpers. Cutover Pass 2a moved login to better-auth, so
// the e2e must create + authenticate users THROUGH better-auth (it owns password
// hashing — scrypt — and the session cookie) rather than inserting bcrypt rows.
//
// Single-table reality (Cutover Pass 2b-ii): better-auth OWNS the one canonical
// `user` table, so signing up a user creates the very row the app's domain
// tables (collections, memberships, preferences, …) FK to. No mirroring: the id
// better-auth generates IS the ownerId every domain fixture seeds under.

import { user } from "@/lib/db/schema";
import { getTestDb } from "./db";

const BASE_URL = process.env.AUTH_URL ?? "http://127.0.0.1:3100";

/** better-auth server endpoints, relative to the /api/auth mount. */
export const BA = {
  signUp: `${BASE_URL}/api/auth/sign-up/email`,
  signIn: `${BASE_URL}/api/auth/sign-in/email`,
  session: `${BASE_URL}/api/auth/get-session`,
} as const;

interface BetterAuthUser {
  id: string;
  email: string;
}

/**
 * Sign up a user via better-auth over HTTP (the running prod server owns the
 * test DB, so this writes the `user` + `account` rows to the same Postgres the
 * domain fixtures use). Returns the better-auth-generated user id.
 */
async function signUpViaBetterAuth(
  email: string,
  password: string,
  name: string,
): Promise<BetterAuthUser> {
  const res = await fetch(BA.signUp, {
    method: "POST",
    // better-auth's originCheck rejects a POST with no Origin (403
    // MISSING_OR_NULL_ORIGIN). A browser always sends one; this plain Node
    // fetch must set it explicitly to the server's own origin.
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `better-auth sign-up failed for ${email}: ${res.status} ${body}`,
    );
  }
  const data = (await res.json()) as { user?: { id?: string } };
  const id = data.user?.id;
  if (!id) {
    throw new Error(`better-auth sign-up returned no user id for ${email}`);
  }
  return { id, email };
}

/**
 * Create (or find) a user through better-auth and return its id. Idempotent by
 * email: if the `user` row already exists, returns its id without re-signing-up
 * (a duplicate better-auth sign-up would 422 on the unique email). The returned
 * id is the canonical `user.id` that domain FKs (collections.ownerId → user.id)
 * resolve to — no mirroring, since better-auth owns the one `user` table.
 */
export async function createBetterAuthUser(
  email: string,
  password: string,
  name: string,
): Promise<string> {
  const { db } = getTestDb();
  const { eq } = await import("drizzle-orm");
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing.length) return existing[0].id;

  const created = await signUpViaBetterAuth(email, password, name);
  return created.id;
}
