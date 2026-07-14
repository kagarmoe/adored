"use client";

import { createAuthClient } from "better-auth/react";

// The better-auth browser client. Points at the /api/auth mount that
// auth-server.ts serves (NextAuth is retired — better-auth owns /api/auth now).
// We build the baseURL from the live origin at call time so it works on
// localhost, preview, and prod without an env var — better-auth only needs the
// origin + basePath.
//
// Adored supports Google login only. There is NO SessionProvider:
// better-auth's useSession is a hook backed by a nanostore, so the old NextAuth
// <SessionProvider> wrapper is gone.
//
// In the browser we use the live origin. During SSR/prerender there is no
// window; better-auth's client still parses baseURL as an absolute URL at
// construction, so we hand it a valid absolute placeholder (never actually
// fetched server-side — these are "use client" call sites). At runtime in the
// browser the origin branch always wins.
const baseURL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/auth`
    : "http://localhost/api/auth";

export const authClient = createAuthClient({
  baseURL,
});

// Thin re-exports so call sites import from one place and never reach for the
// old NextAuth react client again.
export const { useSession, signIn, signOut } = authClient;
