import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { CollectionRow } from '@/components/operator/CollectionRow'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))

const date = new Date('2024-03-15')

describe('CollectionRow', () => {
  it('renders collection name', () => {
    render(<CollectionRow id={1} name="Spring Totes" itemCount={5} createdAt={date} />)
    expect(screen.getByText('Spring Totes')).toBeInTheDocument()
  })

  it('renders item count', () => {
    render(<CollectionRow id={1} name="X" itemCount={7} createdAt={date} />)
    expect(screen.getByText(/7 items/)).toBeInTheDocument()
  })

  it('renders zero item count', () => {
    render(<CollectionRow id={1} name="X" itemCount={0} createdAt={date} />)
    expect(screen.getByText(/0 items/)).toBeInTheDocument()
  })

  it('renders Manage link pointing to /collections/{id}', () => {
    render(<CollectionRow id={42} name="X" itemCount={0} createdAt={date} />)
    const link = screen.getByRole('link', { name: /manage/i })
    expect(link).toHaveAttribute('href', '/collections/42')
  })

  it('renders creation date', () => {
    render(<CollectionRow id={1} name="X" itemCount={0} createdAt={date} />)
    expect(screen.getByText(/created/i)).toBeInTheDocument()
  })
})
