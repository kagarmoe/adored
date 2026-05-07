import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { CollectionRow } from '@/components/operator/CollectionRow'
import Link from 'next/link'

export const metadata = { title: 'Dashboard — Purseinator' }

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
      <div className="flex items-center justify-between mb-10">
        <h1 className="font-display text-heading text-text-primary">Collections</h1>
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
