import { ItemCard } from './ItemCard'
import type { Tier } from '@/lib/elo'

interface Item {
  id: number
  eloRating: number
  tier: Tier
  brand: string
  style: string
  heroUrl: string | null
}

const TIER_LABELS: Record<Tier, string> = {
  favorites: 'Favorites',
  strongKeeps: 'Strong Keeps',
  maybeKeeps: 'Maybe Keeps',
  belowTheLine: 'Below the Line',
}

interface Props {
  tier: Tier
  items: Item[]
}

export function TierSection({ tier, items }: Props) {
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 border-t border-surface" />
        <p className="font-display text-label uppercase tracking-widest text-text-muted whitespace-nowrap">
          {TIER_LABELS[tier]}
        </p>
        <div className="flex-1 border-t border-surface" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => (
          <ItemCard key={item.id} {...item} />
        ))}
      </div>
    </section>
  )
}
