import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ComparisonCard } from '@/components/curator/ComparisonCard'

describe('ComparisonCard', () => {
  it('renders brand name', () => {
    render(<ComparisonCard brand="Gucci" style="Bamboo" heroUrl={null} onPick={vi.fn()} />)
    expect(screen.getByText('Gucci')).toBeInTheDocument()
  })

  it('renders style when provided', () => {
    render(<ComparisonCard brand="Gucci" style="Bamboo" heroUrl={null} onPick={vi.fn()} />)
    expect(screen.getByText('Bamboo')).toBeInTheDocument()
  })

  it('renders "Unknown" when brand is empty', () => {
    render(<ComparisonCard brand="" style="" heroUrl={null} onPick={vi.fn()} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders image when heroUrl is provided', () => {
    render(<ComparisonCard brand="Prada" style="" heroUrl="https://example.com/bag.jpg" onPick={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/bag.jpg')
  })

  it('does not render image when heroUrl is null', () => {
    render(<ComparisonCard brand="Prada" style="" heroUrl={null} onPick={vi.fn()} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('calls onPick when clicked', () => {
    const onPick = vi.fn()
    render(<ComparisonCard brand="Prada" style="" heroUrl={null} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onPick).toHaveBeenCalledOnce()
  })

  it('renders as a button', () => {
    render(<ComparisonCard brand="Prada" style="" heroUrl={null} onPick={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('image alt is brand name', () => {
    render(<ComparisonCard brand="LV" style="" heroUrl="https://x.com/a.jpg" onPick={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'LV')
  })

  it('image alt falls back to "Bag" when brand is empty', () => {
    render(<ComparisonCard brand="" style="" heroUrl="https://x.com/a.jpg" onPick={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Bag')
  })
})
