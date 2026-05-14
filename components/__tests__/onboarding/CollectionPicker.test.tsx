import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { CollectionPicker } from '@/components/onboarding/CollectionPicker'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))

const memberships = [
  { collectionId: 1, collectionName: 'My Bags', role: 'operator' as const, itemCount: 4 },
  { collectionId: 2, collectionName: "Mom's Bags", role: 'curator' as const, itemCount: 9 },
]

describe('CollectionPicker', () => {
  it('badges each collection with the user role', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByText(/operator/i)).toBeInTheDocument()
    expect(screen.getByText(/curator/i)).toBeInTheDocument()
  })

  it('links operator collections to the operator view', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByRole('link', { name: /my bags/i })).toHaveAttribute(
      'href',
      '/collections/1',
    )
  })

  it('links curator collections to the curator view', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByRole('link', { name: /mom's bags/i })).toHaveAttribute('href', '/2')
  })

  it('offers a link to create a new collection', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByRole('link', { name: /new collection/i })).toHaveAttribute(
      'href',
      '/collections/new',
    )
  })
})
