import { db } from './db'
import { claimInvites } from './invites'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

/**
 * NextAuth callbacks, extracted from auth.ts so they can be unit-tested.
 *
 * Role is per-collection now (CollectionMembership), so the token/session no
 * longer carry a global role — they carry only the user id. Authorization is
 * resolved per-collection, server-side, via lib/authz.ts.
 */

/**
 * Allow sign-in for any verified email — do NOT gate on a pre-existing DB row.
 *
 * @auth/core runs this callback at SEND time with a throwaway `defaultUser` for
 * any email not already in the User table (see send-token.js). Gating on
 * `dbUser` here returns false for that throwaway user, @auth/core throws
 * `AccessDenied`, and the magic-link email is never sent — i.e. nobody can sign
 * up (purses-e7f, P0). The User row is created at click time by the adapter's
 * `createUser`, so by the time the `jwt` callback runs `dbUser` exists; there
 * is no risk of an id-less session from returning true here.
 *
 * Pending invites are claimed when the row already exists (returning curator,
 * or the second pass of the verification flow after createUser has run).
 */
export async function signInCallback({
  user,
}: {
  user: { email?: string | null }
}): Promise<boolean> {
  if (!user.email) return false
  const dbUser = await db.user.findUnique({ where: { email: user.email } })
  if (dbUser) await claimInvites(dbUser.id, dbUser.email)
  return true
}

/** On sign-in, stamp the db user id onto the token. No role — it is per-collection. */
export async function jwtCallback({
  token,
  user,
}: {
  token: JWT
  user?: { email?: string | null } | null
}): Promise<JWT> {
  if (user?.email) {
    const dbUser = await db.user.findUnique({ where: { email: user.email } })
    if (dbUser) token.id = String(dbUser.id)
  }
  return token
}

/** Expose the user id on the session. */
export async function sessionCallback({
  session,
  token,
}: {
  session: Session
  token: JWT
}): Promise<Session> {
  if (token.id) session.user.id = token.id as string
  return session
}
