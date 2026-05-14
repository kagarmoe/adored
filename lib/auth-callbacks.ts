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
 * Allow sign-in only when a backing DB user row exists, then claim any pending
 * invites for it. For legitimate new users the adapter's `createUser` has
 * already inserted the row by the time this runs, so `dbUser` is non-null.
 * Returning `true` without a row would mint a session whose JWT has no `id`
 * (jwtCallback skips a null dbUser), and every downstream `session.user.id`
 * guard would then throw "Unauthorized".
 */
export async function signInCallback({
  user,
}: {
  user: { email?: string | null }
}): Promise<boolean> {
  if (!user.email) return false
  const dbUser = await db.user.findUnique({ where: { email: user.email } })
  if (!dbUser) return false
  await claimInvites(dbUser.id, dbUser.email)
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
