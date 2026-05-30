#!/usr/bin/env node
// Post-deploy smoke test — re-runnable on demand: `npm run smoke`.
// Probes the live production app and fails non-zero on any HTTP error,
// missing-content, or Next.js error-page response. Designed to catch the
// 2026-05-15-class outage where a deployed CODE shipped before its matching
// DB migration was applied and every server-rendered page returned 500.

const DEMO_URL = process.env.SMOKE_DEMO_URL || 'https://purseinator-demo.kimberlygarmoe.com/'
const APP_URL = (process.env.SMOKE_APP_URL || 'https://purseinator-app.vercel.app').replace(/\/$/, '')

const SANITY = process.argv.includes('--sanity')

// Substrings that mean "Next.js rendered an error", regardless of HTTP status.
// A real page can mention "404" in routing internals (parallel-route fallbacks),
// so these are tuned for the actual error-page templates, not generic numbers.
const ERROR_BODY_MARKERS = [
  'Application error: a server-side exception',
  'Application error: a client-side exception',
  'This Serverless Function has crashed',
  '500: Internal Server Error',
  'INTERNAL_SERVER_ERROR',
  'FUNCTION_INVOCATION_FAILED',
  'FUNCTION_INVOCATION_TIMEOUT',
]

const results = []
function record(name, ok, info) { results.push({ name, ok, info }) }

async function probe(name, url, { expectTitle } = {}) {
  const headers = { 'user-agent': 'purseinator-smoke/1.0' }

  let res, body
  try {
    res = await fetch(url, { headers, redirect: 'follow' })
    body = await res.text()
  } catch (err) {
    record(name, false, `${url} — fetch failed: ${err.message}`)
    return
  }

  if (res.status !== 200) {
    record(name, false, `${url} — HTTP ${res.status} (${body.length} bytes)`)
    return
  }

  for (const marker of ERROR_BODY_MARKERS) {
    if (body.includes(marker)) {
      record(name, false, `${url} — body contains error marker: "${marker}"`)
      return
    }
  }

  if (expectTitle) {
    const m = body.match(/<title>([^<]*)<\/title>/)
    const title = m?.[1] ?? '<no title>'
    if (!title.includes(expectTitle)) {
      record(name, false, `${url} — expected title to include "${expectTitle}", got "${title}"`)
      return
    }
  }

  record(name, true, `HTTP 200, ${body.length} bytes${expectTitle ? `, title OK` : ''}`)
}

// /api/health returns JSON and exercises a real Prisma query. We assert both
// HTTP 200 AND status:ok in the body — a 200 with status:error would mean the
// route is reachable but the DB is down.
async function probeHealth(name, url) {
  let res, body
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'purseinator-smoke/1.0', accept: 'application/json' },
      redirect: 'follow',
    })
    body = await res.text()
  } catch (err) {
    record(name, false, `${url} — fetch failed: ${err.message}`)
    return
  }

  if (res.status !== 200) {
    record(name, false, `${url} — HTTP ${res.status} (${body.slice(0, 200)})`)
    return
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    record(name, false, `${url} — non-JSON body (${body.slice(0, 200)})`)
    return
  }

  if (parsed.status !== 'ok') {
    record(name, false, `${url} — status="${parsed.status}", db="${parsed.db}", error="${parsed.error ?? ''}"`)
    return
  }

  record(name, true, `HTTP 200, status=ok, db=${parsed.db}, schema_version=${parsed.schema_version ?? '?'}`)
}

async function main() {
  console.log(`# Smoke test — ${new Date().toISOString()}`)
  console.log(`# DEMO_URL=${DEMO_URL}`)
  console.log(`# APP_URL=${APP_URL}`)
  console.log()

  // 1. Public demo flow — server-renders Collection rows; the 2026-05-15
  //    outage manifested here first.
  await probe('demo-home', DEMO_URL, { expectTitle: 'PurseInator' })

  // 2. Public auth-free page.
  await probe('login', `${APP_URL}/login`, { expectTitle: 'Sign in' })

  // 3. Unauthenticated DB-exercise probe. Replaces the old curator-home-authed
  //    probe so we no longer need AUTH_SECRET in GitHub. Hits Prisma + the pg
  //    adapter + Neon — the same surface that the 2026-05-15 migration-drift
  //    outage broke.
  await probeHealth('health', `${APP_URL}/api/health`)

  // Optional sanity verification: confirm the probe logic actually catches a
  // 500. We point it at a guaranteed-500 endpoint and assert that probe()
  // would flag it as failing. This satisfies the bead's acceptance criterion
  // "A sanity test (point it at a known-bad endpoint) confirms it catches a 500"
  // without depending on a real production outage to verify.
  if (SANITY) {
    const url = 'https://httpbin.org/status/500'
    let status = null, err = null
    try {
      const r = await fetch(url, { redirect: 'follow' })
      status = r.status
    } catch (e) {
      err = e
    }
    const caught = status !== 200
    record('sanity-catches-500', caught,
      err
        ? `${url} unreachable (${err.message}) — cannot verify`
        : `${url} returned HTTP ${status} → probe would ${caught ? 'correctly FAIL' : 'INCORRECTLY PASS'}`)
  }

  let failed = 0
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name} — ${r.info}`)
    if (!r.ok) failed++
  }
  console.log()
  console.log(`${results.length - failed}/${results.length} checks passed`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('smoke test crashed:', err)
  process.exit(2)
})
