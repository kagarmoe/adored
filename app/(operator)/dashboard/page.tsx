import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { CollectionRow } from '@/components/operator/CollectionRow'
import Link from 'next/link'

export const metadata = { title: 'Dashboard — PurseInator' }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const collections = await db.collection.findMany({
    where: { ownerId: parseInt(session.user.id) },
    include: { items: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <>
      <div className="mb-12">
        <h1
          className="font-display text-text-primary leading-none mb-1"
          style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
        >
          Collections
        </h1>
        <p className="font-body text-sm italic text-text-muted">
          {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
        </p>
      </div>
      <div className="flex justify-end mb-6">
        <Link
          href="/collections/new"
          className="font-display text-label uppercase tracking-widest text-accent no-underline"
        >
          + New
        </Link>
      </div>
      {collections.map(c => (
        <CollectionRow
          key={c.id}
          id={c.id}
          name={c.name}
          itemCount={c.items.length}
          createdAt={c.createdAt}
        />
      ))}
    </>
  )
}
