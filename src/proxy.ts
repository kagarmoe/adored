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
    // public only so the legacy URL can redirect to /login.
    "/((?!_next(?:/|$)|api/auth(?:/|$)|login(?:/|$)|signup(?:/|$)|shared(?:/|$)|tutorial(?:/|$)|tutorials(?:/|$)|onboarding(?:/|$)).*)",
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
  return NextResponse.redirect(loginUrl);
}
