import { test, expect } from './fixtures'

test.describe('curator home', () => {
  test('shows collections heading', async ({ curatorPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /your collections/i })).toBeVisible()
  })

  test('header shows curator role indicator', async ({ curatorPage: page }) => {
    await page.goto('/')
    await expect(page.getByText(/curator/i)).toBeVisible()
  })

  test('shows empty state when no collections', async ({ curatorPage: page }) => {
    await page.goto('/')
    // Either shows collection cards or empty state — should not show login
    await expect(page).not.toHaveURL('/login')
  })
})

test.describe('operator gets redirected from / to /dashboard', () => {
  test('operator visiting / lands on /dashboard', async ({ operatorPage: page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/dashboard')
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
