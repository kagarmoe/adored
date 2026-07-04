import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";
import {
  baUser,
  baSession,
  baAccount,
  baVerification,
} from "@/lib/db/better-auth-schema";

// better-auth `auth` instance — Phase 0 of the migration. It runs ALONGSIDE the
// live NextAuth setup; nothing switches yet (no façade, no middleware, no UI).
//
// - drizzleAdapter maps better-auth's four core models onto our `ba_*` Drizzle
//   tables (distinct names → no collision with NextAuth's live tables).
// - emailAndPassword + Google + magic-link are the three sign-in methods.
// - Google creds are optional until the user provides them (empty strings keep
//   the provider registered but inert — the app still boots).
// - magic-link reuses the existing Resend transport in `src/lib/email.ts`.
// - nextCookies() MUST be the LAST plugin: plugins wrap each other like
//   middleware, and the cookie-writer must see the final response to attach the
//   Set-Cookie that carries the session.
//
// Secret/base URL prefer the better-auth-specific vars, falling back to the
// existing NextAuth `AUTH_SECRET`/`AUTH_URL` so a single secret can serve both.
// better-auth rate-limits auth requests per-IP and is ON in production builds.
// The e2e suite runs a production `next start` and drives many sign-up/sign-in
// calls from a single loopback IP (baseline + per-user authz fixtures), which
// trips the limiter (429). Disable it only for loopback base URLs — real
// deployments (https origin) keep the protection. Host is parsed defensively;
// a malformed URL leaves rate limiting ON (fail-safe).
function isLoopbackBaseUrl(): boolean {
  const raw = process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL;
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export const auth = betterAuth({
  rateLimit: { enabled: !isLoopbackBaseUrl() },
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: baUser,
      session: baSession,
      account: baAccount,
      verification: baVerification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL,
  // Mounted at /api/ba-auth (not the default /api/auth): NextAuth still owns
  // /api/auth/[...nextauth], and Next.js App Router forbids two differently-
  // named catch-all slugs ([...all] vs [...nextauth]) under one path segment.
  // better-auth builds all its route + callback URLs from this basePath, so it
  // must match the [...all] mount. Phase 5 (NextAuth removed) can move both
  // back to /api/auth.
  basePath: "/api/ba-auth",
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    magicLink({
      // better-auth builds the verification URL and hands us { email, url };
      // forward it to the existing Resend helper (which takes { to, url }).
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLink({ to: email, url });
      },
    }),
    // Keep nextCookies LAST — see note above.
    nextCookies(),
  ],
});
