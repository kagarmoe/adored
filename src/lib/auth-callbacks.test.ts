import { describe, expect, it, vi, beforeEach } from "vitest";

// auth.ts builds `authOptions` at module load: it calls getDb() for the
// DrizzleAdapter and reads `env` values for the providers/secret. We mock those
// module-load boundaries so importing authOptions doesn't touch a real DB or
// require a fully-populated process.env. We do NOT mock the callbacks under
// test — those are exercised for real.
vi.mock("@/lib/db", () => ({
  getDb: () => ({}), // DrizzleAdapter just wraps this object; never queried here.
}));

// DrizzleAdapter inspects the db object at construction and rejects a bare stub.
// The adapter wiring isn't under test (callbacks are), so stub it to a no-op.
vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: () => ({}),
}));

// EmailProvider's module require()s `nodemailer`, which isn't installed in the
// test environment. Stub the provider so importing authOptions doesn't pull in
// nodemailer; the provider config itself isn't under test here (callbacks are).
vi.mock("next-auth/providers/email", () => ({
  default: (config: unknown) => ({ id: "email", type: "email", ...(config as object) }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_SECRET: "x".repeat(32),
    EMAIL_FROM: "noreply@example.com",
    EMAIL_SERVER_HOST: "localhost",
    EMAIL_SERVER_PORT: 1025,
    EMAIL_SERVER_USER: undefined,
    EMAIL_SERVER_PASSWORD: undefined,
    NODE_ENV: "test",
  },
}));

import { authOptions } from "./auth";

const jwt = authOptions.callbacks!.jwt!;
const session = authOptions.callbacks!.session!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authOptions.callbacks.jwt", () => {
  it("copies the authenticated user's id onto the token on sign-in", async () => {
    const token = { sub: "abc", name: "Kim" };
    const user = { id: "user_01XYZ", email: "kim@example.com", name: "Kim" };

    const result = await jwt({ token, user } as Parameters<typeof jwt>[0]);

    expect(result.id).toBe("user_01XYZ");
    expect(result.name).toBe("Kim"); // existing token fields preserved
  });

  it("leaves the token unchanged on subsequent calls (no user present)", async () => {
    const token = { id: "user_01XYZ", name: "Kim" };

    const result = await jwt({ token } as Parameters<typeof jwt>[0]);

    expect(result.id).toBe("user_01XYZ");
    expect(result).toEqual(token);
  });
});

describe("authOptions.callbacks.session", () => {
  it("injects token.id onto session.user.id so the client sees the user id", async () => {
    const sessionArg = {
      user: { email: "kim@example.com", name: "Kim" },
      expires: "2099-01-01",
    };
    const token = { id: "user_01XYZ" };

    const result = await session({ session: sessionArg, token } as Parameters<typeof session>[0]);

    expect((result.user as { id: string }).id).toBe("user_01XYZ");
    expect(result.user!.email).toBe("kim@example.com"); // existing user fields preserved
  });

  it("returns the session untouched when there is no user", async () => {
    const sessionArg = { expires: "2099-01-01" } as Parameters<typeof session>[0]["session"];
    const token = { id: "user_01XYZ" };

    const result = await session({ session: sessionArg, token } as Parameters<typeof session>[0]);

    expect(result).toBe(sessionArg);
    expect((result as { user?: unknown }).user).toBeUndefined();
  });
});
