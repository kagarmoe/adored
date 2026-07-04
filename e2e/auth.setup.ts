import { test as setup, expect } from "@playwright/test";
import { resetDb, closeDb } from "./fixtures/db";
import { BASELINE_USER } from "./fixtures/seed";

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

// Runs once before the viewport projects. Establishes a session via BETTER-AUTH
// (Cutover Pass 2a) and saves storageState so every other spec starts
// authenticated. The flow:
//
//   1. resetDb() — clean slate (truncates the canonical better-auth + domain tables).
//   2. POST /api/auth/sign-up/email — better-auth creates the baseline user
//      (the canonical `user` row + `account` with a scrypt password) and sets
//      the `better-auth.session_token` cookie in this request context. That
//      `user` row IS what the app's domain FKs (collections.ownerId → user.id)
//      resolve to — no mirroring (Cutover Pass 2b-ii collapsed to one table).
//   3. Confirm the session via /get-session, then persist storageState.
//
// We authenticate via the API rather than driving the /login UI: the login page
// only works after hydration, which races cold-build CI. The login *UI* itself
// is covered by the dedicated auth spec, which exercises the real form.
setup("authenticate", async ({ request }) => {
  await step("resetDb", resetDb);

  // better-auth sign-up: creates the canonical user row + lands the session
  // cookie in this request's jar. Returns the better-auth-generated user id.
  const signUpRes = await step("better-auth sign-up", () =>
    request.post(`${BASE_URL}/api/auth/sign-up/email`, {
      data: {
        email: BASELINE_USER.email,
        password: BASELINE_USER.password,
        name: BASELINE_USER.name,
      },
    }),
  );
  expect(signUpRes.ok(), "better-auth sign-up returned non-2xx").toBeTruthy();
  const signUpBody = (await signUpRes.json()) as { user?: { id?: string } };
  const userId = signUpBody.user?.id;
  expect(userId, "better-auth sign-up returned no user id").toBeTruthy();
  await closeDb();

  // Confirm the session is real before saving state. better-auth's get-session
  // returns { session, user } (or null); assert the user email matches.
  const sessionRes = await step("Session transport", () =>
    request.get(`${BASE_URL}/api/auth/get-session`),
  );
  expect(sessionRes.ok(), "session request failed").toBeTruthy();
  const session = await sessionRes.json();
  expect(session?.user?.email).toBe(BASELINE_USER.email);

  await request.storageState({ path: AUTH_FILE });
});
