import Link from 'next/link'

export interface PickerMembership {
  collectionId: number
  collectionName: string
  role: 'operator' | 'curator'
  itemCount: number
}

interface Props {
  memberships: PickerMembership[]
}

/**
 * Post-auth home for a user with at least one collection membership. Each card
 * is badged with the user's role in that collection and links to the right
 * view: operators manage content (`/collections/[id]`), curators rank (`/[id]`).
 * A curator can still reach the operator view from inside the collection.
 */
export function CollectionPicker({ memberships }: Props) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-heading text-text-primary">Your collections</h1>
        <Link
          href="/collections/new"
          className="font-display text-label uppercase tracking-widest text-accent no-underline"
        >
          + New collection
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {memberships.map(m => {
          const href = m.role === 'operator' ? `/collections/${m.collectionId}` : `/${m.collectionId}`
          return (
            <Link
              key={m.collectionId}
              href={href}
              className="block bg-surface rounded-lg px-6 py-5 no-underline hover:bg-accent/5 transition-colors"
            >
              <p className="font-display text-text-muted text-label uppercase tracking-widest mb-1">
                {m.itemCount} {m.itemCount === 1 ? 'bag' : 'bags'} ·{' '}
                <span className="text-accent">{m.role}</span>
              </p>
              <h2 className="font-display text-xl text-text-primary">{m.collectionName}</h2>
            </Link>
          )
        })}
      </div>
    </>
  )
}
