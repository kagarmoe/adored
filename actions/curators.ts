'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { assertCollectionRole } from '@/lib/authz'
import { sendInviteEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'

/**
 * An operator adds a curator to a collection by email.
 *
 * A CollectionInvite row is always recorded. If the email already has an
 * account, the curator membership is created immediately and the invite is
 * stamped accepted; otherwise the invite stays pending and is claimed when that
 * email next signs in (see lib/invites.ts). Either way the invitee gets a
 * notification email — best-effort, so a Resend failure does not undo the
 * invite.
 */
export async function addCuratorByEmail(collectionId: number, email: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  // Operator-level required (a curator-member satisfies this too).
  await assertCollectionRole(collectionId, session.user.id, 'operator')

  const normalized = email.trim().toLowerCase()

  const collection = await db.collection.findUnique({ where: { id: collectionId } })
  if (!collection) throw new Error('Collection not found')

  await db.collectionInvite.upsert({
    where: { collectionId_email: { collectionId, email: normalized } },
    create: {
      collectionId,
      email: normalized,
      role: 'curator',
      invitedById: parseInt(session.user.id),
    },
    update: {},
  })

  const existing = await db.user.findUnique({ where: { email: normalized } })
  if (existing) {
    await db.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId, userId: existing.id } },
      create: { collectionId, userId: existing.id, role: 'curator' },
      update: {},
    })
    await db.collectionInvite.update({
      where: { collectionId_email: { collectionId, email: normalized } },
      data: { acceptedAt: new Date() },
    })
  }

  try {
    await sendInviteEmail(
      normalized,
      collection.name,
      session.user.name ?? session.user.email ?? 'An operator',
    )
  } catch (err) {
    // Best-effort: the invite/membership row is the source of truth.
    console.error('addCuratorByEmail: invite email failed (non-fatal):', err)
  }

  revalidatePath(`/collections/${collectionId}`)
}
