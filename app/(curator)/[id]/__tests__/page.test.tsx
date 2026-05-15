import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCollection = vi.hoisted(() => vi.fn())
const mockIsDemoRequest = vi.hoisted(() => vi.fn())
const mockGetDemoCollection = vi.hoisted(() => vi.fn())
const mockNotFound = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_NOT_FOUND')
}))

vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('@/actions/collections', () => ({ getCollection: (id: number) => mockGetCollection(id) }))
vi.mock('@/lib/demo-server', () => ({
  isDemoRequest: () => mockIsDemoRequest(),
  getDemoCollection: () => mockGetDemoCollection(),
}))
vi.mock('@/components/curator/TierSection', () => ({
  TierSection: ({ tier }: { tier: string }) => <div data-testid={`tier-${tier}`} />,
}))
vi.mock('@/components/curator/DemoCollectionView', () => ({
  DemoCollectionView: () => <div data-testid="demo-view" />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}))

import CollectionPage from '../page'

const params = Promise.resolve({ id: '2' })

const items = [
  { id: 1, eloRating: 1100, brand: 'A', style: 'a', photos: [] },
  { id: 2, eloRating: 900, brand: 'B', style: 'b', photos: [] },
]

describe('CollectionPage — operator completion-gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoRequest.mockResolvedValue(false)
  })

  it('calls notFound() when getCollection returns null', async () => {
    mockGetCollection.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it("shows a 'not complete yet' state to an operator while rankingCompletedAt is null", async () => {
    mockGetCollection.mockResolvedValue({
      name: 'Bags', items, viewerRole: 'operator', rankingCompletedAt: null,
    })
    render(await CollectionPage({ params }))
    expect(screen.getByText(/isn.t complete yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('tier-favorites')).not.toBeInTheDocument()
  })

  it('shows the ranked tiers to an operator once rankingCompletedAt is set', async () => {
    mockGetCollection.mockResolvedValue({
      name: 'Bags', items, viewerRole: 'operator', rankingCompletedAt: new Date(),
    })
    render(await CollectionPage({ params }))
    expect(screen.getByTestId('tier-favorites')).toBeInTheDocument()
    expect(screen.queryByText(/isn.t complete yet/i)).not.toBeInTheDocument()
  })

  it('shows the ranked tiers to a curator even when rankingCompletedAt is null', async () => {
    mockGetCollection.mockResolvedValue({
      name: 'Bags', items, viewerRole: 'curator', rankingCompletedAt: null,
    })
    render(await CollectionPage({ params }))
    expect(screen.getByTestId('tier-favorites')).toBeInTheDocument()
    expect(screen.queryByText(/isn.t complete yet/i)).not.toBeInTheDocument()
  })

  it('shows the Sort link to a curator but not to an operator', async () => {
    mockGetCollection.mockResolvedValue({
      name: 'Bags', items, viewerRole: 'curator', rankingCompletedAt: null,
    })
    const { unmount } = render(await CollectionPage({ params }))
    expect(screen.getByRole('link', { name: /sort/i })).toHaveAttribute('href', '/2/rank')
    unmount()

    mockGetCollection.mockResolvedValue({
      name: 'Bags', items, viewerRole: 'operator', rankingCompletedAt: new Date(),
    })
    render(await CollectionPage({ params }))
    expect(screen.queryByRole('link', { name: /sort/i })).not.toBeInTheDocument()
  })
})
