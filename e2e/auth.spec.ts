import { test, expect } from '@playwright/test'

test('login page renders heading, email input, and submit button', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /purseinator/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /send link/i })).toBeVisible()
})

test('entering email shows confirmation message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('test@example.com')
  await page.getByRole('button', { name: /send link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()
})

test('confirmation message includes the submitted email', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('myemail@example.com')
  await page.getByRole('button', { name: /send link/i }).click()
  await expect(page.getByText(/myemail@example\.com/)).toBeVisible()
})

test('unauthenticated / redirects to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})

test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
})

test('unauthenticated /collections/new redirects to /login', async ({ page }) => {
  await page.goto('/collections/new')
  await expect(page).toHaveURL('/login')
})

test('email input requires valid email format', async ({ page }) => {
  await page.goto('/login')
  const input = page.getByLabel(/email/i)
  await input.fill('not-an-email')
  await page.getByRole('button', { name: /send link/i }).click()
  // HTML5 validation should prevent submission
  const validationMessage = await input.evaluate((el: HTMLInputElement) => el.validationMessage)
  expect(validationMessage).not.toBe('')
})

test('submit button shows loading state while sending', async ({ page }) => {
  await page.goto('/login')
  // Intercept the signIn network call to create a loading window
  await page.route('**/api/auth/**', async route => {
    await new Promise(r => setTimeout(r, 500))
    await route.continue()
  })
  await page.getByLabel(/email/i).fill('test@example.com')
  await page.getByRole('button', { name: /send link/i }).click()
  await expect(page.getByRole('button', { name: /sending/i })).toBeVisible()
})

// Regression for purses-e7f (P0): submitting an UNKNOWN email must still reach
// the Resend send. The previous bug made @auth/core throw AccessDenied at send
// time for any email not already in the DB, so the magic link never went out —
// yet LoginForm still showed "check your email", so the UI-only tests above
// stayed green. This test asserts the actual send is attempted.
test('submitting an unknown email attempts a magic-link send', async ({ page }) => {
  let resendAttempted = false
  await page.route('https://api.resend.com/**', async route => {
    resendAttempted = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'e2e-stub' }),
    })
  })
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(`e2e-unknown-${Date.now()}@example.com`)
  await page.getByRole('button', { name: /send link/i }).click()
  // With the bug, @auth/core throws AccessDenied before sendVerificationRequest,
  // so api.resend.com is never hit and this poll never flips true.
  await expect.poll(() => resendAttempted, { timeout: 5_000 }).toBe(true)
})
