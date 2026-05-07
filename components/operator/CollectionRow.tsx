import Link from 'next/link'

interface Props {
  id: number
  name: string
  itemCount: number
  createdAt: Date
}

export function CollectionRow({ id, name, itemCount, createdAt }: Props) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-surface">
      <div>
        <p className="font-display text-text-primary">{name}</p>
        <p className="font-body text-sm text-text-muted">
          {itemCount} items · created {createdAt.toLocaleDateString()}
        </p>
      </div>
      <Link
        href={`/collections/${id}`}
        className="font-display text-label uppercase tracking-widest text-accent no-underline"
      >
        Manage →
      </Link>
    </div>
  )
}
