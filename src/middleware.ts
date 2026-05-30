import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export const config = {
  matcher: [
    // Protect all routes except these
    "/((?!_next|api/auth|login|shared).*)",
  ],
};

export default withAuth(
  function middleware() {
    // If we reach here, the user is authenticated (withAuth handled the check)
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Allow access if token exists (user is authenticated)
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);
