import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockIsDemoRequest = vi.hoisted(() => vi.fn())
const mockGetDemoCollection = vi.hoisted(() => vi.fn())
const mockGetUserCollections = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_REDIRECT')
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/demo-server', () => ({
  isDemoRequest: () => mockIsDemoRequest(),
  getDemoCollection: () => mockGetDemoCollection(),
}))
vi.mock('@/actions/collections', () => ({
  getUserCollections: () => mockGetUserCollections(),
}))
vi.mock('@/components/curator/CollectionCard', () => ({
  CollectionCard: () => <div data-testid="collection-card" />,
}))

import CuratorHome from '../page'

describe('CuratorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoRequest.mockResolvedValue(false)
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'curator' } })
    mockGetUserCollections.mockResolvedValue([])
  })

  it('shows an explanatory notice when redirected away from an operator-only area', async () => {
    render(await CuratorHome({ searchParams: Promise.resolve({ denied: 'operator' }) }))
    expect(screen.getByRole('alert')).toHaveTextContent(/operator/i)
  })

  it('shows no notice on a normal visit', async () => {
    render(await CuratorHome({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
