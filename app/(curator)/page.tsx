import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getUserMemberships } from '@/actions/collections'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { CollectionPicker } from '@/components/onboarding/CollectionPicker'
import { getDemoCollection, isDemoRequest } from '@/lib/demo-server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your collections — PurseInator' }

/**
 * The post-auth router. A signed-in user with no collection memberships lands
 * on the onboarding screen (create a collection, or join a pending invite);
 * everyone else gets the role-badged collection picker. Demo-host requests are
 * still redirected straight into the demo collection.
 */
export default async function CuratorHome() {
  if (await isDemoRequest()) {
    const demo = await getDemoCollection()
    if (!demo) {
      return (
        <p className="font-body text-text-muted">
          Demo data has not been seeded yet. Run <code>npx tsx prisma/seed-demo.ts</code>.
        </p>
      )
    }
    redirect(`/${demo.id}`)
  }

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const memberships = await getUserMemberships()

  if (memberships.length === 0) {
    // Pending invites are auto-claimed at sign-in; this covers the edge case of
    // an invite that arrived (or failed to claim) within the current session.
    const invites = await db.collectionInvite.findMany({
      where: { email: session.user.email ?? '', acceptedAt: null },
      include: { collection: { select: { name: true } } },
    })
    return (
      <OnboardingScreen
        invites={invites.map(i => ({
          collectionId: i.collectionId,
          collectionName: i.collection.name,
          role: i.role,
        }))}
      />
    )
  }

  return (
    <CollectionPicker
      memberships={memberships.map(m => ({
        collectionId: m.collectionId,
        collectionName: m.collection.name,
        role: m.role,
        itemCount: m.collection.items.length,
      }))}
    />
  )
}
