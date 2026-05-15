import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockAssertRole = vi.hoisted(() => vi.fn())
const mockIsDemoRequest = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_REDIRECT')
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/authz', () => ({ assertCollectionRole: mockAssertRole }))
vi.mock('@/lib/demo-server', () => ({ isDemoRequest: () => mockIsDemoRequest() }))
vi.mock('@/components/curator/SessionPicker', () => ({
  SessionPicker: ({ collectionId }: { collectionId: number }) => (
    <div data-testid="session-picker">{collectionId}</div>
  ),
}))

import RankPage from '../page'

const params = Promise.resolve({ id: '2' })

describe('RankPage — interactive ranking is curator-level', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoRequest.mockResolvedValue(false)
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockAssertRole.mockResolvedValue('curator')
  })

  it('renders the session picker for a demo request (anonymous ranking)', async () => {
    mockIsDemoRequest.mockResolvedValue(true)
    render(await RankPage({ params }))
    expect(screen.getByTestId('session-picker')).toHaveTextContent('2')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it('renders the session picker for a curator member', async () => {
    render(await RankPage({ params }))
    expect(mockAssertRole).toHaveBeenCalledWith(2, '1', 'curator')
    expect(screen.getByTestId('session-picker')).toBeInTheDocument()
  })

  it('redirects an operator-only member to the results view', async () => {
    mockAssertRole.mockRejectedValue(new Error('Unauthorized'))
    await expect(RankPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/2')
  })

  it('redirects to /login when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(RankPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
