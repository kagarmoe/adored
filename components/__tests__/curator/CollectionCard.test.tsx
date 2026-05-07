import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { CollectionCard } from '@/components/curator/CollectionCard'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))

describe('CollectionCard', () => {
  it('renders collection name', () => {
    render(<CollectionCard id={1} name="Spring Bags" description="" itemCount={3} />)
    expect(screen.getByText('Spring Bags')).toBeInTheDocument()
  })

  it('renders item count with singular "bag"', () => {
    render(<CollectionCard id={1} name="X" description="" itemCount={1} />)
    expect(screen.getByText(/1 bag/)).toBeInTheDocument()
  })

  it('renders item count with plural "bags"', () => {
    render(<CollectionCard id={1} name="X" description="" itemCount={5} />)
    expect(screen.getByText(/5 bags/)).toBeInTheDocument()
  })

  it('links to the correct collection route', () => {
    render(<CollectionCard id={42} name="X" description="" itemCount={0} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/42')
  })

  it('renders description when provided', () => {
    render(<CollectionCard id={1} name="X" description="My everyday bags" itemCount={0} />)
    expect(screen.getByText('My everyday bags')).toBeInTheDocument()
  })

  it('does not render description paragraph when empty', () => {
    const { container } = render(<CollectionCard id={1} name="X" description="" itemCount={0} />)
    // With no description: only count and name paragraphs, no third <p>
    const paras = container.querySelectorAll('p')
    expect(paras).toHaveLength(1) // only the item-count <p>
  })
})
