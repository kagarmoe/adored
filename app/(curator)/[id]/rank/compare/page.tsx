import { notFound } from 'next/navigation'
import { CompareUI } from '@/components/curator/CompareUI'
import { displayPhotoUrl } from '@/lib/photo'
import { getDemoCollection, isDemoRequest } from '@/lib/demo-server'

export const dynamic = 'force-dynamic'

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const collectionId = parseInt(id)

  if (await isDemoRequest()) {
    const demo = await getDemoCollection()
    if (!demo || demo.id !== collectionId) notFound()
    return (
      <CompareUI
        collectionId={collectionId}
        demoItems={demo.items.map(item => ({
          id: item.id,
          brand: item.brand,
          style: item.style,
          heroUrl: item.photos[0] ? displayPhotoUrl(item.photos[0]) : null,
        }))}
      />
    )
  }

  return <CompareUI collectionId={collectionId} />
}
