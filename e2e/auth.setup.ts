import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test as setup, expect } from "@playwright/test";
import { resetDb, closeDb } from "./fixtures/db";
import { BASELINE_USER } from "./fixtures/seed";
import {
  BA,
  cookieHeader,
  createBetterAuthUser,
  createSessionCookieForUser,
} from "./fixtures/better-auth";

const AUTH_FILE = "e2e/.auth/user.json";
const BASE_URL = process.env.AUTH_URL ?? "http://127.0.0.1:3100";

function hasNestedErrors(error: unknown): error is { errors: unknown[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown[] }).errors)
  );
}

function formatTransportError(error: unknown): string {
  if (hasNestedErrors(error)) {
    const nested = error.errors
      .map((entry) => {
        if (entry instanceof Error) return `${entry.name}: ${entry.message}`;
        return String(entry);
      })
      .join(" | ");
    return `Aggregate-like error against ${BASE_URL}${nested ? ` -> ${nested}` : ""}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(`${label} failed: ${formatTransportError(error)}`);
  }
}

// Runs once before the viewport projects. Establishes a real Better Auth DB
// session without enabling password auth:
//
//   1. resetDb() — clean slate.
//   2. Insert the canonical user + Google account rows.
//   3. Insert a Better Auth session row and write its signed session cookie to
//      Playwright storageState.
//   4. Confirm /api/auth/get-session accepts that cookie.
setup("authenticate", async ({ request }) => {
  await step("resetDb", resetDb);

  const user = await step("create Google-linked Better Auth user", () =>
    createBetterAuthUser(BASELINE_USER.email, BASELINE_USER.name),
  );
  const sessionCookie = await step("create Better Auth session cookie", () =>
    createSessionCookieForUser(user.id),
  );
  await closeDb();

  const sessionRes = await step("Session transport", () =>
    request.get(BA.session, {
      headers: { Cookie: cookieHeader(sessionCookie) },
    }),
  );
  expect(sessionRes.ok(), "session request failed").toBeTruthy();
  const session = await sessionRes.json();
  expect(session?.user?.email).toBe(BASELINE_USER.email);

  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(
    AUTH_FILE,
    JSON.stringify({ cookies: [sessionCookie], origins: [] }, null, 2),
  );
});
