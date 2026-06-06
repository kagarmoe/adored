import { test as setup, expect } from "@playwright/test";
import { resetDb, closeDb } from "./fixtures/db";
import { seedBaseline, BASELINE_USER } from "./fixtures/seed";

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

// Runs once before the viewport projects. Seeds a known user and establishes a
// session via the NextAuth credentials API, then saves storageState so every
// other spec starts authenticated.
//
// We authenticate via the API rather than driving the /login UI: the login page
// is a client component whose signIn() only works after hydration, which races
// the test on cold builds (CI always cold-builds). The API path is
// deterministic. The login *UI* itself is covered by the dedicated auth spec
// (T7), which is where exercising the real form belongs.
setup("authenticate", async ({ request }) => {
  await step("resetDb", resetDb);
  await step("seedBaseline", seedBaseline);
  await step("closeDb", closeDb);

  // Use Playwright's API request context for auth bootstrap and persist its
  // resulting cookie jar directly to storageState.
  const csrfRes = await step("CSRF transport", () =>
    request.get(`${BASE_URL}/api/auth/csrf`)
  );
  expect(csrfRes.ok(), "CSRF request failed").toBeTruthy();
  const { csrfToken } = await csrfRes.json();
  expect(csrfToken, "CSRF token missing/empty").toBeTruthy();

  const loginRes = await step("Credentials transport", () =>
    request.post(`${BASE_URL}/api/auth/callback/credentials`, {
      form: {
        csrfToken,
        email: BASELINE_USER.email,
        password: BASELINE_USER.password,
        json: "true",
      },
    })
  );
  expect(loginRes.ok(), "credentials callback returned non-2xx").toBeTruthy();

  // Confirm the session is real before saving state.
  const sessionRes = await step("Session transport", () =>
    request.get(`${BASE_URL}/api/auth/session`)
  );
  expect(sessionRes.ok(), "session request failed").toBeTruthy();
  const session = await sessionRes.json();
  expect(session?.user?.email).toBe(BASELINE_USER.email);

  await request.storageState({ path: AUTH_FILE });
});
