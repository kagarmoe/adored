import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { assertCollectionRole } from '@/lib/authz'
import { isDemoRequest } from '@/lib/demo-server'
import { SessionPicker } from '@/components/curator/SessionPicker'

/**
 * The interactive ranking flow is curator-level only. Demo visitors rank
 * anonymously (host-based, no membership). For a real session, an operator-only
 * member is redirected to the read-only results view rather than getting a
 * silent server-action failure inside CompareUI.
 */
export default async function RankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const collectionId = parseInt(id)

  if (!(await isDemoRequest())) {
    const session = await auth()
    if (!session?.user?.id) redirect('/login')
    try {
      await assertCollectionRole(collectionId, session.user.id, 'curator')
    } catch {
      redirect(`/${id}`)
    }
  }

  return <SessionPicker collectionId={collectionId} />
}
