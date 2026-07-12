import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";
import { env, previewTrustedOrigins } from "@/lib/env";
import { user, session, account, verification } from "@/lib/db/schema";

// better-auth `auth` instance — the ONLY auth backend now (NextAuth retired in
// Cutover Pass 2b-i). Mounted at /api/auth; the façade (auth.ts), middleware,
// and UI all read/drive it.
//
// - drizzleAdapter maps better-auth's four core models onto our canonical
//   Drizzle tables (`user`/`session`/`account`/`verification`). Pass 2b-ii
//   collapsed the old `user`↔`ba_user` split into this single `user` table:
//   better-auth OWNS it and every domain FK resolves straight to it — no more
//   mirroring bridge.
// - emailAndPassword + Google + magic-link are the three sign-in methods.
// - Google creds are optional until the user provides them (empty strings keep
//   the provider registered but inert — the app still boots).
// - magic-link reuses the existing Resend transport in `src/lib/email.ts`.
// - nextCookies() MUST be the LAST plugin: plugins wrap each other like
//   middleware, and the cookie-writer must see the final response to attach the
//   Set-Cookie that carries the session.
//
// Secret/base URL prefer the better-auth-specific vars, falling back to the
// VALIDATED `env.AUTH_SECRET`/`env.AUTH_URL` (not raw process.env) so a single
// secret can serve both AND preview deploys — which have no explicit AUTH_URL —
// get env.ts's VERCEL_URL-derived base URL instead of `undefined`.
// better-auth rate-limits auth requests per-IP and is ON in production builds.
// The e2e suite runs a production `next start` and drives many sign-up/sign-in
// calls from a single loopback IP (baseline + per-user authz fixtures), which
// trips the limiter (429). Disable it only for loopback base URLs — real
// deployments (https origin) keep the protection. Host is parsed defensively;
// a malformed URL leaves rate limiting ON (fail-safe).
function isLoopbackBaseUrl(): boolean {
  const raw = process.env.BETTER_AUTH_URL ?? env.AUTH_URL;
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
      user,
      session,
      account,
      verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? env.AUTH_URL,
  // Mounted at the default /api/auth (Cutover Pass 2b-i): NextAuth is retired,
  // so the [...nextauth] collision is gone and better-auth owns /api/auth. It
  // builds all its route + callback URLs from this basePath, so it must match
  // the src/app/api/auth/[...all] mount — and the Google callback is therefore
  // …/api/auth/callback/google (matches the setup checklist).
  basePath: "/api/auth",
  // better-auth's default trusted set is exactly [origin(baseURL)]; this ADDS the
  // preview branch alias so sign-in works on the URL the PR comment links to. It is
  // [] everywhere but preview — production's trusted set is unchanged. See env.ts.
  trustedOrigins: previewTrustedOrigins(),
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
