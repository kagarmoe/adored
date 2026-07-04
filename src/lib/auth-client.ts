"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// The better-auth browser client (Cutover Pass 2a). Points at the /api/ba-auth
// mount that auth-server.ts serves (NOT NextAuth's /api/auth). We build the
// baseURL from the live origin at call time so it works on localhost, preview,
// and prod without an env var — better-auth only needs the origin + basePath.
//
// `magicLinkClient` mirrors the server's magicLink() plugin so
// `authClient.signIn.magicLink` is typed and routed to /api/ba-auth/sign-in/
// magic-link. There is NO SessionProvider: better-auth's useSession is a hook
// backed by a nanostore, so the old next-auth <SessionProvider> wrapper is gone.
//
// In the browser we use the live origin. During SSR/prerender there is no
// window; better-auth's client still parses baseURL as an absolute URL at
// construction, so we hand it a valid absolute placeholder (never actually
// fetched server-side — these are "use client" call sites). At runtime in the
// browser the origin branch always wins.
const baseURL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/ba-auth`
    : "http://localhost/api/ba-auth";

export const authClient = createAuthClient({
  baseURL,
  plugins: [magicLinkClient()],
});

// Thin re-exports so call sites import from one place and never reach for
// next-auth/react again.
export const { useSession, signIn, signOut, signUp } = authClient;
