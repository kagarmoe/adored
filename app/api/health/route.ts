import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Force every request to hit the DB. A cached 200 is a lie when the DB is down.
export const dynamic = 'force-dynamic'

export async function GET() {
  const schemaVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown'

  try {
    // Trivial read that exercises Prisma + the pg adapter + Neon. No PII.
    await db.collection.count()
    return NextResponse.json(
      { status: 'ok', db: 'ok', schema_version: schemaVersion },
      { status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { status: 'error', db: 'down', error: message },
      { status: 500 },
    )
  }
}
