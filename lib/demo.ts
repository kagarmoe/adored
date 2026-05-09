export const DEMO_HOST = 'purseinator-demo.kimberlygarmoe.com'

export const DEMO_USER_EMAIL = 'demo-owner@purseinator.local'
export const DEMO_COLLECTION_NAME = 'Cute Animals — Demo'

export function isDemoHost(host: string | null | undefined): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  if (bare === DEMO_HOST) return true
  // Allow Vercel preview deployments that include the demo prefix in the hostname.
  // Production preview URLs look like `purseinator-demo-<hash>-<scope>.vercel.app`.
  if (bare.startsWith('purseinator-demo-') && bare.endsWith('.vercel.app')) return true
  return false
}
