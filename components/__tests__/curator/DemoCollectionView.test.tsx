import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { DemoCollectionView } from '@/components/curator/DemoCollectionView'
import { appendDemoComparison } from '@/lib/demo-store'

const ITEMS = [
  { id: 1, brand: 'Mochi', style: 'Tabby', heroUrl: null },
  { id: 2, brand: 'Pepper', style: 'Black cat', heroUrl: null },
  { id: 3, brand: 'Biscuit', style: 'Pug', heroUrl: null },
  { id: 4, brand: 'Toast', style: 'Shiba', heroUrl: null },
]

describe('DemoCollectionView', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the collection name and a sort link', () => {
    render(<DemoCollectionView collectionId={42} collectionName="Cute Animals" items={ITEMS} />)
    expect(screen.getByText('Cute Animals')).toBeInTheDocument()
    const sortLink = screen.getByText('Sort →')
    expect(sortLink.closest('a')).toHaveAttribute('href', '/42/rank')
  })

  it('shows a not-enough-items message for collections with <2 items', () => {
    render(
      <DemoCollectionView
        collectionId={1}
        collectionName="Solo"
        items={[{ id: 1, brand: 'A', style: '', heroUrl: null }]}
      />,
    )
    expect(screen.getByText(/not enough items to rank/i)).toBeInTheDocument()
  })

  it('renders a Reset button for clearing the demo state', () => {
    render(<DemoCollectionView collectionId={1} collectionName="Demo" items={ITEMS} />)
    expect(screen.getByRole('button', { name: /reset demo/i })).toBeInTheDocument()
  })

  it('renders all items even before localStorage is read', () => {
    render(<DemoCollectionView collectionId={1} collectionName="Demo" items={ITEMS} />)
    for (const item of ITEMS) {
      expect(screen.getByText(item.brand)).toBeInTheDocument()
    }
  })

  it('respects existing comparisons from localStorage on mount', async () => {
    // Item 1 wins many comparisons before render — should land in favorites tier.
    appendDemoComparison(1, { itemAId: 1, itemBId: 2, winnerId: 1 })
    appendDemoComparison(1, { itemAId: 1, itemBId: 3, winnerId: 1 })
    appendDemoComparison(1, { itemAId: 1, itemBId: 4, winnerId: 1 })

    render(<DemoCollectionView collectionId={1} collectionName="Demo" items={ITEMS} />)

    // Use findByText so we wait for the post-mount effect to flush.
    expect(await screen.findByText('Favorites')).toBeInTheDocument()
  })
})
