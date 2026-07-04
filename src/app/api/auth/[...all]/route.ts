import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth-server";

// better-auth's whole server surface (sign-in/out, OAuth callbacks, magic-link
// verify) under one catch-all route, mounted at /api/auth. NextAuth is retired
// (Cutover Pass 2b-i), so the [...nextauth] collision is gone and better-auth
// owns /api/auth outright. auth-server.ts's basePath ("/api/auth") matches this
// mount, and the Google callback is …/api/auth/callback/google.
export const { GET, POST } = toNextJsHandler(auth);
