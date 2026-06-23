import type { JWT } from "next-auth/jwt";

export async function jwtCallback({ token, user, trigger, session }: any): Promise<JWT> {
  if (user) {
    token.id = user.id;
    token.name = user.name ?? null;
  }
  if (trigger === "update" && session && "name" in session) {
    // The form sends "" to clear; the DB persists null. Coerce so the live
    // session matches the DB single-source-of-truth.
    token.name = session.name === "" ? null : session.name; // string | null
  }
  return token;
}

export async function sessionCallback({ session, token }: any) {
  if (session.user) {
    session.user.id = token.id as string;
    session.user.name = (token.name as string | null) ?? null;
  }
  return session;
}
