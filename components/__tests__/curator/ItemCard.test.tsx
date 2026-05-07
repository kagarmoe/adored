import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ItemCard } from '@/components/curator/ItemCard'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

describe('ItemCard', () => {
  it('renders brand name', () => {
    render(<ItemCard id={1} brand="Chanel" style="2.55" heroUrl={null} />)
    expect(screen.getByText('Chanel')).toBeInTheDocument()
  })

  it('renders style when provided', () => {
    render(<ItemCard id={1} brand="Chanel" style="2.55" heroUrl={null} />)
    expect(screen.getByText('2.55')).toBeInTheDocument()
  })

  it('renders "Unknown brand" when brand is empty', () => {
    render(<ItemCard id={1} brand="" style="" heroUrl={null} />)
    expect(screen.getByText('Unknown brand')).toBeInTheDocument()
  })

  it('does not render style element when style is empty', () => {
    const { container } = render(<ItemCard id={1} brand="X" style="" heroUrl={null} />)
    const paras = container.querySelectorAll('p')
    expect(paras).toHaveLength(1)
  })

  it('renders image when heroUrl provided', () => {
    render(<ItemCard id={1} brand="LV" style="" heroUrl="https://example.com/img.jpg" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg')
    expect(img).toHaveAttribute('alt', 'LV')
  })

  it('shows placeholder div when heroUrl is null', () => {
    const { container } = render(<ItemCard id={1} brand="LV" style="" heroUrl={null} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('image alt falls back to "Bag" when brand is empty', () => {
    render(<ItemCard id={1} brand="" style="" heroUrl="https://x.com/a.jpg" />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Bag')
  })
})
