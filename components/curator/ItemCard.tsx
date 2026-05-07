import Image from 'next/image'

interface Props {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

export function ItemCard({ id, brand, style, heroUrl }: Props) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 bg-surface rounded overflow-hidden flex-shrink-0">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt={brand || 'Bag'}
            width={64}
            height={64}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-surface" />
        )}
      </div>
      <div>
        <p className="font-display text-text-primary">{brand || 'Unknown brand'}</p>
        {style && <p className="font-body text-sm text-text-muted">{style}</p>}
      </div>
    </div>
  )
}
