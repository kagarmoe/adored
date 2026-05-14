import { db } from './db'

/**
 * Converts every pending invite for `email` into a CollectionMembership and
 * stamps the invite accepted. Called from the signIn callback so an operator
 * can "add a curator" by email before that person has an account — the invite
 * is claimed automatically the next time they sign in.
 *
 * Idempotent: the membership upsert and the `acceptedAt: null` filter make a
 * repeat call a no-op.
 */
export async function claimInvites(userId: number, email: string): Promise<void> {
  const pending = await db.collectionInvite.findMany({
    where: { email, acceptedAt: null },
  })
  for (const invite of pending) {
    await db.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: invite.collectionId, userId } },
      create: { collectionId: invite.collectionId, userId, role: invite.role },
      update: {},
    })
    await db.collectionInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })
  }
}
