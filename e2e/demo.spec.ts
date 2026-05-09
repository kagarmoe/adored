import { test, expect } from '@playwright/test'

// The demo flow runs without auth — these tests use the plain Playwright
// fixtures rather than `./fixtures` (which forge a NextAuth session cookie).
// Demo activation is gated on `isDemoHost(host)`. In tests we set
// DEMO_HOST_TEST_OVERRIDE=localhost:3000 in the dev server's env so the
// existing localhost:3000 baseURL is treated as a demo host.

test.describe('demo home', () => {
  test('shows the Demo badge and a seeded item from the menagerie', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('demo-badge')).toBeVisible()
    // `Mochi`, `Pepper`, `Biscuit` come from prisma/seed-demo.ts. If any one
    // is visible we know the demo collection rendered with its items, so we
    // assert against just one to stay resilient to future seed reshuffles.
    await expect(
      page.getByText(/Mochi|Pepper|Biscuit/).first(),
    ).toBeVisible()
  })

  // Critical regression test for the next/image remotePatterns bug (purses-lui).
  // The Next.js image optimizer at /_next/image returns HTTP 400 for any source
  // host not listed in next.config.ts → images.remotePatterns. A broken response
  // means <img> elements report `naturalWidth === 0`, even though the DOM and
  // CSS look fine. Unit tests can't catch this — the optimizer doesn't run in
  // jsdom — so this assertion is the only line of defense.
  test('at least one item image actually rendered (naturalWidth > 0)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const firstImage = page.locator('img').first()
    await expect(firstImage).toBeVisible()
    const naturalWidth = await firstImage.evaluate(
      (el) => (el as HTMLImageElement).naturalWidth,
    )
    expect(naturalWidth).toBeGreaterThan(0)
  })
})
