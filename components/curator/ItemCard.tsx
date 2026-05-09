import Image from 'next/image'

interface Props {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

export function ItemCard({ id, brand, style, heroUrl }: Props) {
  return (
    <div className="flex items-center gap-4 bg-surface/40 rounded-lg p-2 md:p-3">
      <div className="w-16 h-16 md:w-20 md:h-20 bg-surface rounded overflow-hidden flex-shrink-0">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt={brand || 'Bag'}
            width={80}
            height={80}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-surface" />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display text-text-primary truncate">{brand || 'Unknown brand'}</p>
        {style && <p className="font-body text-sm text-text-muted truncate">{style}</p>}
      </div>
    </div>
  )
}
