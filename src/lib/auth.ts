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

export const authOptions: NextAuthOptions = {
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
          throw new Error("Invalid credentials");
        }

        const db = getDb();
        const users = await db
          .select()
          .from(user)
          .where(eq(user.email, credentials.email))
          .limit(1);

        if (!users.length) {
          throw new Error("No user found with this email");
        }

        const userRecord = users[0];
        if (!userRecord.password) {
          throw new Error("User has no password set");
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          userRecord.password
        );

        if (!passwordMatch) {
          throw new Error("Invalid password");
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
        host: process.env.EMAIL_SERVER_HOST || "localhost",
        port: parseInt(process.env.EMAIL_SERVER_PORT || "1025"),
        secure: process.env.NODE_ENV === "production",
        auth: process.env.EMAIL_SERVER_USER
          ? {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
      from: process.env.EMAIL_FROM || "noreply@purseinator.app",
      sendVerificationRequest: async ({ identifier, url }) => {
        if (process.env.NODE_ENV === "development") {
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
        const existing = await db
          .select()
          .from(user)
          .where(eq(user.email, authUser.email))
          .limit(1);

        if (!existing.length) {
          await db.insert(user).values({
            id: generateId("user"),
            email: authUser.email,
            name: authUser.name || authUser.email.split("@")[0],
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
    strategy: "database",
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
