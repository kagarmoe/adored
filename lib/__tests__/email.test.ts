import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.hoisted(() => vi.fn())
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

import { sendInviteEmail } from '@/lib/email'

describe('sendInviteEmail', () => {
  const original = process.env.AUTH_RESEND_KEY

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_RESEND_KEY
    else process.env.AUTH_RESEND_KEY = original
  })

  it('does nothing when AUTH_RESEND_KEY is not set', async () => {
    delete process.env.AUTH_RESEND_KEY
    await sendInviteEmail('c@d.com', 'Spring 2026', 'Kimberly')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends a templated invite email when the key is set', async () => {
    process.env.AUTH_RESEND_KEY = 're_test'
    await sendInviteEmail('c@d.com', 'Spring 2026', 'Kimberly')
    expect(mockSend).toHaveBeenCalledTimes(1)
    const arg = mockSend.mock.calls[0][0]
    expect(arg.to).toBe('c@d.com')
    expect(arg.subject).toContain('Spring 2026')
    expect(arg.subject).toContain('Kimberly')
    expect(arg.html).toContain('Spring 2026')
  })
})
