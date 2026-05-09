import { describe, it, expect } from 'vitest'
import { displayPhotoUrl, hasProcessedVersion } from '@/lib/photo'

describe('displayPhotoUrl', () => {
  it('returns blobKey when bgRemoved is true', () => {
    expect(
      displayPhotoUrl({ blobKey: 'proc.png', originalBlobKey: 'orig.jpg', bgRemoved: true }),
    ).toBe('proc.png')
  })

  it('returns originalBlobKey when bgRemoved is false and original exists', () => {
    expect(
      displayPhotoUrl({ blobKey: 'proc.png', originalBlobKey: 'orig.jpg', bgRemoved: false }),
    ).toBe('orig.jpg')
  })

  it('falls back to blobKey when originalBlobKey is empty (legacy)', () => {
    expect(
      displayPhotoUrl({ blobKey: 'old.jpg', originalBlobKey: '', bgRemoved: false }),
    ).toBe('old.jpg')
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

  it('false when originalBlobKey is empty (legacy)', () => {
    expect(
      hasProcessedVersion({ blobKey: 'old.jpg', originalBlobKey: '', bgRemoved: false }),
    ).toBe(false)
  })
})
