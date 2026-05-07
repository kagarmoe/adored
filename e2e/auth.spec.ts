import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /purseinator/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /send link/i })).toBeVisible()
})

test('entering email shows confirmation', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('test@example.com')
  await page.getByRole('button', { name: /send link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()
})

test('unauthenticated access to / redirects to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})
