interface Props {
  brand: string
  style: string
  heroUrl: string | null
  onPick: () => void
}

export function ComparisonCard({ brand, style, heroUrl, onPick }: Props) {
  return (
    <button
      onClick={onPick}
      className="flex-1 flex flex-col bg-surface rounded-xl overflow-hidden hover:ring-2 hover:ring-accent transition-all text-left"
    >
      <div className="aspect-[3/4] w-full bg-ground">
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={brand || 'Bag'} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="px-4 md:px-5 py-3 md:py-4">
        <p className="font-display text-text-primary md:text-lg">{brand || 'Unknown'}</p>
        {style && <p className="font-body text-sm md:text-base text-text-muted">{style}</p>}
      </div>
    </button>
  )
}
