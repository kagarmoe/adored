import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { account, session as sessionTable, user } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { E2E_AUTH_SECRET } from "./auth-env";
import { getTestDb } from "./db";

const BASE_URL = process.env.AUTH_URL ?? "http://127.0.0.1:3100";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const BA = {
  session: `${BASE_URL}/api/auth/get-session`,
} as const;

export interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
}

export interface BetterAuthSessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
}

function authSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? E2E_AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET/BETTER_AUTH_SECRET for e2e auth fixture");
  }
  return secret;
}

function signCookieValue(value: string): string {
  const signature = createHmac("sha256", authSecret()).update(value).digest("base64");
  return encodeURIComponent(`${value}.${signature}`);
}

function cookieDomain(): string {
  return new URL(BASE_URL).hostname;
}

async function ensureGoogleAccount(userId: string, email: string) {
  const { db } = getTestDb();
  const existing = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")))
    .limit(1);
  if (existing.length) return;

  await db.insert(account).values({
    id: generateId("acct"),
    userId,
    accountId: `google-${userId}`,
    providerId: "google",
    scope: "openid email profile",
    idToken: `e2e-google-id-token-for-${email}`,
  });
}

/**
 * Create or find a canonical Better Auth user linked to a Google account.
 * E2E tests should not call password sign-up/sign-in endpoints; Adored supports
 * Google login only.
 */
export async function createBetterAuthUser(
  email: string,
  name: string,
): Promise<BetterAuthUser> {
  const { db } = getTestDb();
  const existing = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing.length) {
    await ensureGoogleAccount(existing[0].id, existing[0].email);
    return existing[0];
  }

  const id = generateId("user");
  await db.insert(user).values({
    id,
    email,
    name,
    emailVerified: true,
  });
  await ensureGoogleAccount(id, email);
  return { id, email, name };
}

export async function createSessionCookieForUser(
  userId: string,
): Promise<BetterAuthSessionCookie> {
  const { db } = getTestDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessionTable).values({
    id: generateId("sess"),
    userId,
    token,
    expiresAt,
    ipAddress: "127.0.0.1",
    userAgent: "adored-e2e",
  });

  return {
    name: "better-auth.session_token",
    value: signCookieValue(token),
    domain: cookieDomain(),
    path: "/",
    expires: Math.floor(expiresAt.getTime() / 1000),
    httpOnly: true,
    secure: BASE_URL.startsWith("https://"),
    sameSite: "Lax",
  };
}

export function cookieHeader(cookie: BetterAuthSessionCookie): string {
  return `${cookie.name}=${cookie.value}`;
}
