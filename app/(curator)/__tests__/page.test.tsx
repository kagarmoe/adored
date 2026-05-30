import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockIsDemoRequest = vi.hoisted(() => vi.fn())
const mockGetDemoCollection = vi.hoisted(() => vi.fn())
const mockGetUserMemberships = vi.hoisted(() => vi.fn())
const mockInviteFindMany = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_REDIRECT')
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/demo-server', () => ({
  isDemoRequest: () => mockIsDemoRequest(),
  getDemoCollection: () => mockGetDemoCollection(),
}))
vi.mock('@/lib/db', () => ({
  db: { collectionInvite: { findMany: () => mockInviteFindMany() } },
}))
vi.mock('@/actions/collections', () => ({
  getUserMemberships: () => mockGetUserMemberships(),
}))
vi.mock('@/components/onboarding/OnboardingScreen', () => ({
  OnboardingScreen: () => <div data-testid="onboarding-screen" />,
}))
vi.mock('@/components/onboarding/CollectionPicker', () => ({
  CollectionPicker: () => <div data-testid="collection-picker" />,
}))

import CuratorHome from '../page'

describe('CuratorHome — post-auth router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoRequest.mockResolvedValue(false)
    mockAuth.mockResolvedValue({ user: { id: '1', email: 'a@b.com' } })
    mockInviteFindMany.mockResolvedValue([])
  })

  it('redirects an unauthenticated visitor to /login', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(CuratorHome()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders the onboarding screen when the user has no memberships', async () => {
    mockGetUserMemberships.mockResolvedValue([])
    render(await CuratorHome())
    expect(screen.getByTestId('onboarding-screen')).toBeInTheDocument()
  })

  it('renders the collection picker when the user has memberships', async () => {
    mockGetUserMemberships.mockResolvedValue([
      { collectionId: 1, role: 'operator', collection: { name: 'A', items: [] } },
    ])
    render(await CuratorHome())
    expect(screen.getByTestId('collection-picker')).toBeInTheDocument()
  })
})
