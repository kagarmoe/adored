import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import crypto from "crypto";

export const authOptions = {
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || "localhost",
        port: parseInt(process.env.EMAIL_SERVER_PORT || "1025"),
        auth: {
          user: process.env.EMAIL_SERVER_USER || "",
          pass: process.env.EMAIL_SERVER_PASSWORD || "",
        },
      },
      from: process.env.EMAIL_FROM || "noreply@purseinator.app",
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // Add user ID to JWT token on sign in
      if (user) {
        // Use email hash as ID if no ID provided
        token.id = user.id || crypto.createHash("sha256").update(user.email || "").digest("hex").slice(0, 16);
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // Add user ID to session from JWT token
      if (session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
