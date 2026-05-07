import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserCollections } from '@/actions/collections'
import { CollectionCard } from '@/components/curator/CollectionCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your collections — Purseinator' }

export default async function CuratorHome() {
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
        <div className="flex flex-col gap-4">
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
