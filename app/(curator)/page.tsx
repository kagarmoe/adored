import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserCollections } from '@/actions/collections'
import { CollectionCard } from '@/components/curator/CollectionCard'
import { getDemoCollection, isDemoRequest } from '@/lib/demo-server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your collections — PurseInator' }

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
  if (!session) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (role === 'operator') redirect('/dashboard')

  const collections = await getUserCollections()

  return (
    <>
      <h1 className="font-display text-heading text-text-primary mb-8">
        Your collections
      </h1>
      {collections.length === 0 ? (
        <p className="font-body text-text-muted">
          No collections yet. Ask your operator to get you set up.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {collections.map(c => (
            <CollectionCard
              key={c.id}
              id={c.id}
              name={c.name}
              description={c.description}
              itemCount={c.items.length}
            />
          ))}
        </div>
      )}
    </>
  )
}
