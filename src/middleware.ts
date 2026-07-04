import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isRequestAuthorized } from "@/lib/middleware-auth";

export const config = {
  matcher: [
    // Protect all routes except these. `tutorial` is the dev-only walkthrough
    // preview; excluding it here just skips the login redirect in dev — the
    // page itself 404s in production, which is the real boundary.
    "/((?!_next|api/auth|login|signup|shared|tutorial).*)",
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
export default function middleware(request: NextRequest) {
  const hasCookie = getSessionCookie(request) !== null;
  if (isRequestAuthorized(request.nextUrl.pathname, hasCookie)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}
