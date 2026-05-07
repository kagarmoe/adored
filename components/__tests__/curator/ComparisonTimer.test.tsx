import { render, screen, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ComparisonTimer } from '@/components/curator/ComparisonTimer'

describe('ComparisonTimer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders an SVG', () => {
    const { container } = render(<ComparisonTimer durationSeconds={60} onExpire={vi.fn()} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('does not call onExpire immediately', () => {
    const onExpire = vi.fn()
    render(<ComparisonTimer durationSeconds={5} onExpire={onExpire} />)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('calls onExpire after durationSeconds ticks', () => {
    const onExpire = vi.fn()
    render(<ComparisonTimer durationSeconds={3} onExpire={onExpire} />)
    // Each tick fires a setState, which schedules the next timer — advance one at a time
    for (let i = 0; i < 3; i++) {
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onExpire).toHaveBeenCalledOnce()
  })

  it('does not call onExpire before time is up', () => {
    const onExpire = vi.fn()
    render(<ComparisonTimer durationSeconds={5} onExpire={onExpire} />)
    act(() => { vi.advanceTimersByTime(4000) })
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('calls onExpire immediately when durationSeconds is 0', () => {
    const onExpire = vi.fn()
    render(<ComparisonTimer durationSeconds={0} onExpire={onExpire} />)
    act(() => { vi.runAllTimers() })
    expect(onExpire).toHaveBeenCalled()
  })

  it('renders two SVG circles (track and progress)', () => {
    const { container } = render(<ComparisonTimer durationSeconds={60} onExpire={vi.fn()} />)
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })
})
