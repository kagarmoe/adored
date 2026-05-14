import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { assertCollectionRole } from '@/lib/authz'
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

  // The interactive comparison flow is curator-level only. An operator-only
  // member is redirected to the read-only results view rather than getting a
  // silent Unauthorized from getNextPair/submitComparison inside CompareUI.
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  try {
    await assertCollectionRole(collectionId, session.user.id, 'curator')
  } catch {
    redirect(`/${id}`)
  }

  return <CompareUI collectionId={collectionId} />
}
