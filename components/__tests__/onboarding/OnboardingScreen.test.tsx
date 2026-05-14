import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))

describe('OnboardingScreen', () => {
  it('always offers creating a new collection', () => {
    render(<OnboardingScreen invites={[]} />)
    expect(
      screen.getByRole('link', { name: /create.*collection/i }),
    ).toHaveAttribute('href', '/collections/new')
  })

  it('lists pending invites with a join link to the collection', () => {
    render(
      <OnboardingScreen
        invites={[{ collectionId: 7, collectionName: 'Spring 2026', role: 'curator' }]}
      />,
    )
    expect(screen.getByText(/spring 2026/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /join/i })).toHaveAttribute('href', '/7')
  })

  it('shows no invite list when there are none', () => {
    render(<OnboardingScreen invites={[]} />)
    expect(screen.queryByRole('link', { name: /join/i })).not.toBeInTheDocument()
  })
})
