import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth-server";

// better-auth's whole server surface (sign-in/out, OAuth callbacks, magic-link
// verify) under one catch-all route, mounted at /api/ba-auth. This is SEPARATE
// from NextAuth's /api/auth/[...nextauth] route — both coexist during the phased
// migration. It lives under /api/ba-auth rather than /api/auth because Next.js
// App Router forbids two differently-named catch-all slugs under one segment;
// auth-server.ts's basePath matches this mount.
export const { GET, POST } = toNextJsHandler(auth);
