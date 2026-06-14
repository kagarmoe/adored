import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { isRequestAuthorized } from "@/lib/middleware-auth";

export const config = {
  matcher: [
    // Protect all routes except these
    "/((?!_next|api/auth|login|signup|shared).*)",
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
