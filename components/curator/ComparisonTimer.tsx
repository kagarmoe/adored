'use client'

import { useEffect, useState, useCallback } from 'react'

interface Props {
  durationSeconds: number
  onExpire: () => void
}

export function ComparisonTimer({ durationSeconds, onExpire }: Props) {
  const [remaining, setRemaining] = useState(durationSeconds)

  const expire = useCallback(() => onExpire(), [onExpire])

  useEffect(() => {
    if (remaining <= 0) {
      expire()
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, expire])

  const progress = remaining / durationSeconds
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="fixed top-6 right-6 opacity-40 pointer-events-none">
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke="var(--color-surface)"
          strokeWidth={4}
        />
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
    </div>
  )
}
