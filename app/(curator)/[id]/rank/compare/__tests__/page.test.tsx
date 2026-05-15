import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockAssertRole = vi.hoisted(() => vi.fn())
const mockIsDemoRequest = vi.hoisted(() => vi.fn())
const mockGetDemoCollection = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_REDIRECT')
}))
const mockNotFound = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_NOT_FOUND')
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: mockNotFound }))
vi.mock('@/lib/authz', () => ({ assertCollectionRole: mockAssertRole }))
vi.mock('@/lib/demo-server', () => ({
  isDemoRequest: () => mockIsDemoRequest(),
  getDemoCollection: () => mockGetDemoCollection(),
}))
vi.mock('@/components/curator/CompareUI', () => ({
  CompareUI: ({ collectionId, demoItems }: { collectionId: number; demoItems?: unknown[] }) => (
    <div data-testid="compare-ui" data-demo={demoItems ? 'true' : 'false'}>{collectionId}</div>
  ),
}))

import ComparePage from '../page'

const params = Promise.resolve({ id: '2' })

describe('ComparePage — interactive comparison is curator-level', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoRequest.mockResolvedValue(false)
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockAssertRole.mockResolvedValue('curator')
  })

  it('renders CompareUI for a curator member', async () => {
    render(await ComparePage({ params }))
    expect(mockAssertRole).toHaveBeenCalledWith(2, '1', 'curator')
    expect(screen.getByTestId('compare-ui')).toHaveTextContent('2')
  })

  it('redirects an operator-only member to the results view', async () => {
    mockAssertRole.mockRejectedValue(new Error('Unauthorized'))
    await expect(ComparePage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/2')
  })

  it('redirects to /login when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(ComparePage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders CompareUI with demoItems for a demo request (no role check)', async () => {
    mockIsDemoRequest.mockResolvedValue(true)
    mockGetDemoCollection.mockResolvedValue({ id: 2, items: [] })
    render(await ComparePage({ params }))
    expect(screen.getByTestId('compare-ui')).toHaveAttribute('data-demo', 'true')
    expect(mockAssertRole).not.toHaveBeenCalled()
  })
})
