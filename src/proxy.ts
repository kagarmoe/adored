import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isRequestAuthorized } from "@/lib/middleware-auth";

export const config = {
  matcher: [
    // Protect all routes except these. `tutorials/*` holds public walkthroughs, and
    // `onboarding/*` holds the public sample images it renders. `api/auth` is
    // excluded because better-auth serves its public Google sign-in/session +
    // OAuth-callback endpoints there and must NOT be 307'd to /login, or the
    // login/callback requests never reach the handler. `signup` remains
    // public only so the legacy URL can redirect to /login. `shared-results/*`
    // is the tokenized read-only share page — SharePanel promises "no account,
    // no signing in", and the token itself is the capability. `invitations/*`
    // (the accept page) and `api/invitations/accept` (its GET preview) are
    // public for the same reason: the 256-bit invitation token IS the read
    // capability. POST accept keeps its own route-level session 401 (DAL
    // enforcement) — this matcher is only the UX redirect, never the security
    // boundary.
    "/((?!_next(?:/|$)|api/auth(?:/|$)|login(?:/|$)|signup(?:/|$)|shared-results(?:/|$)|tutorial(?:/|$)|tutorials(?:/|$)|onboarding(?:/|$)|invitations(?:/|$)|api/invitations/accept(?:/|$)).*)",
  ],
};

// Optimistic auth (Cutover Pass 1, Phase 3). better-auth's getSessionCookie is a
// PRESENCE check on the session cookie — no DB read at the edge, so it can't
// distinguish a valid session from a forged cookie. That's fine: real
// enforcement lives in the DAL (every route/page independently calls
// requireAuth/requireApiCapability). Middleware is only the UX redirect. The
// SESSIONLESS_POST_ROUTES allowlist (Vercel Blob's upload-completion callback,
// which self-verifies its Blob-signed payload) is preserved via
// isRequestAuthorized, exactly as under the old withAuth.
export default function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1") {
    return NextResponse.next();
  }

  const hasCookie = getSessionCookie(request) !== null;
  if (isRequestAuthorized(request.nextUrl.pathname, hasCookie)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  // Carry the original path so sign-in lands back on it — an emailed
  // /invitations/[token] link must survive the login round-trip. Path only
  // (always "/"-rooted), never a full URL, so this can't open-redirect.
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
