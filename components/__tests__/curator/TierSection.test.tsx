import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { TierSection } from '@/components/curator/TierSection'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const item = (id: number) => ({ id, eloRating: 1000, tier: 'favorites' as const, brand: `Brand${id}`, style: 'Classic', heroUrl: null })

describe('TierSection', () => {
  it('renders null when items list is empty', () => {
    const { container } = render(<TierSection tier="favorites" items={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders tier label "Favorites"', () => {
    render(<TierSection tier="favorites" items={[item(1)]} />)
    expect(screen.getByText(/favorites/i)).toBeInTheDocument()
  })

  it('renders tier label "Strong Keeps"', () => {
    render(<TierSection tier="strongKeeps" items={[item(1)]} />)
    expect(screen.getByText(/strong keeps/i)).toBeInTheDocument()
  })

  it('renders tier label "Maybe Keeps"', () => {
    render(<TierSection tier="maybeKeeps" items={[item(1)]} />)
    expect(screen.getByText(/maybe keeps/i)).toBeInTheDocument()
  })

  it('renders tier label "Below the Line"', () => {
    render(<TierSection tier="belowTheLine" items={[item(1)]} />)
    expect(screen.getByText(/below the line/i)).toBeInTheDocument()
  })

  it('renders all items', () => {
    render(<TierSection tier="favorites" items={[item(1), item(2), item(3)]} />)
    expect(screen.getByText('Brand1')).toBeInTheDocument()
    expect(screen.getByText('Brand2')).toBeInTheDocument()
    expect(screen.getByText('Brand3')).toBeInTheDocument()
  })

  it('wraps in a section element', () => {
    const { container } = render(<TierSection tier="favorites" items={[item(1)]} />)
    expect(container.querySelector('section')).toBeInTheDocument()
  })
})
