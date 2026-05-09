export const DEMO_HOST = 'purseinator-demo.kimberlygarmoe.com'

export const DEMO_USER_EMAIL = 'demo-owner@purseinator.local'
export const DEMO_COLLECTION_NAME = 'Cute Animals — Demo'

// Threat model: the Host header is trusted because Vercel normalizes it at the
// edge before the request reaches Next.js. If this app is ever deployed off
// Vercel, place a host-validating reverse proxy in front, OR rely on the
// proxy.ts default-deny (which neutralizes most Host-spoofing risk on the demo
// branch by allowlisting only the demo's own URL shape). The
// DEMO_HOST_TEST_OVERRIDE escape hatch below is gated on
// NODE_ENV !== 'production', so it is dead code in production builds even if
// the env var leaks (committed .env, copied Vercel config, CI secret bleed).
export function isDemoHost(host: string | null | undefined): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  if (bare === DEMO_HOST) return true
  // Allow Vercel preview deployments that include the demo prefix in the hostname.
  // Production preview URLs look like `purseinator-demo-<hash>-<scope>.vercel.app`.
  if (bare.startsWith('purseinator-demo-') && bare.endsWith('.vercel.app')) return true
  // Test-only escape hatch: comma-separated list of hosts (with optional port)
  // that should be treated as the demo host. Gated on NODE_ENV !== 'production'
  // so the var is never even read in deployed environments — the override
  // covers both vitest (NODE_ENV='test') and `next dev` for playwright
  // (NODE_ENV='development'); production builds (`next build`/`next start`)
  // skip this branch entirely.
  if (process.env.NODE_ENV !== 'production') {
    const override = process.env.DEMO_HOST_TEST_OVERRIDE
    if (override) {
      const needle = host.toLowerCase()
      for (const raw of override.split(',')) {
        const entry = raw.trim().toLowerCase()
        if (!entry) continue
        if (entry === needle || entry === bare) return true
      }
    }
  }
  return false
}

// Allowed demo paths (default-deny — anything else redirects to '/'):
//   /                              demo home (DemoCollectionView)
//   /<id>                          curator collection view
//   /<id>/rank                     session length picker
//   /<id>/rank/compare             head-to-head comparison
// `<id>` is a positive integer; the page-level handlers also check that the id
// matches the actual demo collection (notFound otherwise).
const DEMO_ALLOWED_PATH = /^\/(?:\d+(?:\/rank(?:\/compare)?)?)?$/

export function isDemoAllowedPath(pathname: string): boolean {
  return DEMO_ALLOWED_PATH.test(pathname)
}
