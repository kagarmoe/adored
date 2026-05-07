import { test, expect } from '@playwright/test'

test.describe('session timer', () => {
  test("shows \"that's enough for today\" after session expires", async ({ page }) => {
    await page.goto('/1/rank/compare?duration=2')
    await page.waitForTimeout(3000)
    await expect(page.getByText(/that.s enough for today/i)).toBeVisible()
  })
})
