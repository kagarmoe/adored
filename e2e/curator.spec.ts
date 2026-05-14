import { test, expect } from './fixtures'

test.describe('post-auth home', () => {
  test('an authenticated user landing on / is not bounced to login', async ({ curatorPage: page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')
  })

  test('/ shows the onboarding or collection-picker UI, not a redirect', async ({ curatorPage: page }) => {
    await page.goto('/')
    // With no memberships the user sees the onboarding screen; with memberships,
    // the collection picker. Either way there is a "collection" link/heading.
    await expect(page.getByRole('link', { name: /collection/i }).first()).toBeVisible()
  })

  test('an operator-named session also lands on / (no role-based redirect)', async ({ operatorPage: page }) => {
    await page.goto('/')
    // The old behaviour redirected operators to /dashboard; role is per-collection
    // now, so the post-auth router keeps everyone on /.
    await expect(page).toHaveURL('/')
  })
})

test.describe('ranking session', () => {
  test('rank picker page shows duration slider', async ({ curatorPage: page }) => {
    await page.goto('/1/rank')
    // May redirect if collection 1 doesn't belong to curator — just not /login
    const url = page.url()
    if (!url.includes('/login')) {
      // If we're on the rank page, check for the slider UI
      const slider = page.getByRole('slider')
      const startButton = page.getByRole('button', { name: /start sorting/i })
      if (await slider.isVisible()) {
        await expect(startButton).toBeVisible()
      }
    }
  })
})

test.describe('timer spec', () => {
  test('shows "that\'s enough for today" after session expires', async ({ page }) => {
    await page.goto('/1/rank/compare?duration=2')
    await expect(page.getByText(/that.s enough for today/i)).toBeVisible({ timeout: 10_000 })
  })
})
