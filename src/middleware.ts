import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { isRequestAuthorized } from "@/lib/middleware-auth";

export const config = {
  matcher: [
    // Protect all routes except these. `tutorial` is the dev-only walkthrough
    // preview; excluding it here just skips the login redirect in dev — the
    // page itself 404s in production, which is the real boundary.
    "/((?!_next|api/auth|login|signup|shared|tutorial).*)",
  ],
};

export default withAuth(
  function middleware() {
    // If we reach here, the user is authenticated (withAuth handled the check)
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) =>
        isRequestAuthorized(req.nextUrl.pathname, !!token),
    },
    pages: {
      signIn: "/login",
    },
  }
);
