import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { head } from '@vercel/blob'

type Props = { params: Promise<{ key: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { key } = await params
  // blobKey stored in DB is just the pathname; reconstruct the full blob URL
  // Vercel Blob keys are stored as the full pathname like "photos/filename.jpg"
  // We need to find the photo by blobKey
  const photo = await db.photo.findFirst({
    where: { blobKey: decodeURIComponent(key) },
  })

  if (!photo) return new NextResponse('Not found', { status: 404 })

  // For private blobs, head() returns a downloadUrl with a short-lived signed token
  const blobInfo = await head(photo.blobKey, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  return NextResponse.redirect(blobInfo.downloadUrl)
}
