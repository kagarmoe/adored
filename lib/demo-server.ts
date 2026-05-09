import 'server-only'
import { headers } from 'next/headers'
import { db } from './db'
import { isDemoHost } from './demo'

export async function isDemoRequest(): Promise<boolean> {
  const h = await headers()
  return isDemoHost(h.get('host'))
}

export async function getDemoCollection() {
  return db.collection.findFirst({
    where: { isDemo: true },
    include: {
      items: {
        include: {
          photos: { where: { isHero: true }, take: 1 },
        },
      },
    },
  })
}
