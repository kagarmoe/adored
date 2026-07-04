import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { jwtCallback, sessionCallback } from "@/lib/auth-callbacks";
import { auth } from "@/lib/auth-server";

// NextAuth options remain wired ONLY for the still-live /api/auth/[...nextauth]
// login route (Cutover Pass 1). Session READS below now come from better-auth —
// so after this pass the NextAuth cookie no longer satisfies getSession() and
// e2e login is expected to fail until Pass 2 moves the UI to the better-auth
// client. The EmailProvider (magic-link) is gone: better-auth owns magic-link
// now (see auth-server.ts), and dropping it also removes the eager nodemailer
// import that the whole test suite had to mock around.
export const authOptions: NextAuthOptions = {
  secret: env.AUTH_SECRET,
  adapter: DrizzleAdapter(getDb()),
  providers: [
    Credentials({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "you@example.com",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid email or password");
        }

        const db = getDb();
        const users = await db
          .select()
          .from(user)
          .where(eq(user.email, credentials.email.toLowerCase()))
          .limit(1);

        if (!users.length || !users[0].password) {
          throw new Error("Invalid email or password");
        }

        const userRecord = users[0];
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          userRecord.password!
        );

        if (!passwordMatch) {
          throw new Error("Invalid email or password");
        }

        return {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
        };
      },
    }),
  ],
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
};

export interface Session {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

// THE FAÇADE (Cutover Pass 1). Reads a better-auth session and returns the
// byte-identical shape the ~249 call sites + the DAL (`userId: string`) already
// depend on: { user: { id, email, name } }. better-auth's getSession returns
// { session, user } | null; we project ONLY id/email/name off `user` so no
// extra fields (image/emailVerified/…) leak into the contract. Because we have
// NOT enabled session.cookieCache, auth.api.getSession does a fresh per-request
// DB read — so a profile display-name edit is reflected on the very next call
// (name-freshness) with no stale JWT claim to invalidate.
export async function getSession(): Promise<Session | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) {
    return null;
  }
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
  };
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAuth(): Promise<{ id: string; email: string; name?: string }> {
  const session = await getSession();
  if (!session?.user) {
    throw new UnauthorizedError("Unauthorized");
  }
  return session.user;
}
