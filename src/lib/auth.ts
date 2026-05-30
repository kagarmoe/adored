import type { NextAuthOptions } from "next-auth";
import { getServerSession as getNextAuthSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateId } from "@/lib/id";
import { env } from "@/lib/env";

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
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
    EmailProvider({
      server: {
        host: env.EMAIL_SERVER_HOST,
        port: env.EMAIL_SERVER_PORT,
        secure: env.NODE_ENV === "production",
        auth: env.EMAIL_SERVER_USER
          ? {
              user: env.EMAIL_SERVER_USER,
              pass: env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
      from: env.EMAIL_FROM,
      sendVerificationRequest: async ({ identifier, url }) => {
        if (env.NODE_ENV === "development") {
          console.log(`[DEV MAGIC LINK] ${identifier}\n${url}`);
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user: authUser }) {
      if (authUser) {
        token.id = authUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
    async signIn({ user: authUser, account }) {
      if (account?.provider === "email" && authUser?.email) {
        const db = getDb();
        const normalizedEmail = authUser.email.toLowerCase().trim();
        const existing = await db
          .select()
          .from(user)
          .where(eq(user.email, normalizedEmail))
          .limit(1);

        if (!existing.length) {
          await db.insert(user).values({
            id: generateId("user"),
            email: normalizedEmail,
            name: authUser.name || normalizedEmail.split("@")[0],
            emailVerified: new Date(),
          });
        }
      }
      return true;
    },
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

export async function getSession(): Promise<Session | null> {
  return getNextAuthSession(authOptions);
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
