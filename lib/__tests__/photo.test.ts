import { describe, it, expect } from 'vitest'
import { displayPhotoUrl, hasProcessedVersion } from '@/lib/photo'

describe('displayPhotoUrl', () => {
  it('returns blobKey (the canonical displayed image)', () => {
    expect(
      displayPhotoUrl({ blobKey: 'proc.png', originalBlobKey: 'orig.jpg', bgRemoved: true }),
    ).toBe('proc.png')
  })

  it('returns blobKey when bgRemoved is false (after toggle, blobKey == original)', () => {
    expect(
      displayPhotoUrl({ blobKey: 'orig.jpg', originalBlobKey: 'proc.png', bgRemoved: false }),
    ).toBe('orig.jpg')
  })
})

describe('hasProcessedVersion', () => {
  it('true when blobKey differs from originalBlobKey', () => {
    expect(
      hasProcessedVersion({ blobKey: 'proc.png', originalBlobKey: 'orig.jpg', bgRemoved: true }),
    ).toBe(true)
  })

  it('false when blobKey equals originalBlobKey', () => {
    expect(
      hasProcessedVersion({ blobKey: 'a.jpg', originalBlobKey: 'a.jpg', bgRemoved: false }),
    ).toBe(false)
  })
})
