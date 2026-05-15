import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/actions/collections', () => ({ createCollection: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import NewCollectionPage from '../page'

describe('NewCollectionPage', () => {
  it('renders name and description fields', () => {
    render(<NewCollectionPage />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('offers an operator/curator role choice, defaulting to operator', () => {
    render(<NewCollectionPage />)
    const operator = screen.getByRole('radio', { name: /^operator/i })
    const curator = screen.getByRole('radio', { name: /^curator/i })
    expect(operator).toBeChecked()
    expect(curator).not.toBeChecked()
    expect(operator).toHaveAttribute('value', 'operator')
    expect(curator).toHaveAttribute('value', 'curator')
  })

  it('has a submit button', () => {
    render(<NewCollectionPage />)
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })
})
