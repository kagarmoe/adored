import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  collection: { count: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.VERCEL_GIT_COMMIT_SHA
  })

  it('returns 200 status:ok db:ok when the DB read succeeds', async () => {
    mockDb.collection.count.mockResolvedValue(42)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok', db: 'ok', schema_version: 'unknown' })
  })

  it('reports the deploy commit as schema_version when Vercel sets it', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567'
    mockDb.collection.count.mockResolvedValue(0)
    const res = await GET()
    const body = await res.json()
    expect(body.schema_version).toBe('abcdef1')
  })

  it('returns 500 status:error db:down with the error message when Prisma throws', async () => {
    mockDb.collection.count.mockRejectedValue(new Error('connection refused'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({
      status: 'error',
      db: 'down',
      error: 'connection refused',
    })
  })

  it('coerces non-Error throws into a string message', async () => {
    mockDb.collection.count.mockRejectedValue('raw string failure')
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('raw string failure')
  })
})
