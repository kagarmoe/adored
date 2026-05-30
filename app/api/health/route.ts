import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { collectionsTable } from '@/lib/db/schema'
import { count } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const schemaVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown'

  try {
    const db = getDb()
    await db.select({ value: count() }).from(collectionsTable)
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
