import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { head } from '@vercel/blob'

type Props = { params: Promise<{ key: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { key } = await params
  const decoded = decodeURIComponent(key)
  // The requested key may be either the processed (blobKey) or the raw
  // (originalBlobKey) variant of a photo — both are valid display URLs.
  const photo = await db.photo.findFirst({
    where: { OR: [{ blobKey: decoded }, { originalBlobKey: decoded }] },
  })

  if (!photo) return new NextResponse('Not found', { status: 404 })

  // Use the canonical key from the DB (not caller input) for the signed-URL fetch.
  const blobInfo = await head(photo.blobKey, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  return NextResponse.redirect(blobInfo.downloadUrl)
}
