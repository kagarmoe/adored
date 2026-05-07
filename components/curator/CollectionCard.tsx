import Link from 'next/link'

interface Props {
  id: number
  name: string
  description: string
  itemCount: number
}

export function CollectionCard({ id, name, description, itemCount }: Props) {
  return (
    <Link
      href={`/${id}`}
      className="block bg-surface rounded-lg px-6 py-5 no-underline hover:bg-accent/5 transition-colors"
    >
      <p className="font-display text-text-muted text-label uppercase tracking-widest mb-1">
        {itemCount} {itemCount === 1 ? 'bag' : 'bags'}
      </p>
      <h2 className="font-display text-xl text-text-primary mb-1">{name}</h2>
      {description && (
        <p className="font-body text-sm text-text-muted">{description}</p>
      )}
    </Link>
  )
}
