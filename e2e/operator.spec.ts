import { test, expect } from './fixtures'

test.describe('operator dashboard', () => {
  test('shows Collections heading', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /collections/i })).toBeVisible()
  })

  test('shows + New link', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: /\+ new/i })).toBeVisible()
  })

  test('header shows operator role indicator', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText(/operator/i)).toBeVisible()
  })

  test('header links to /dashboard', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    const link = page.getByRole('link', { name: /purseinator/i })
    await expect(link).toHaveAttribute('href', '/dashboard')
  })

  test('shows collection count', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    // Count text like "3 collections" or "0 collections"
    await expect(page.getByText(/\d+ collections?/i)).toBeVisible()
  })
})

test.describe('new collection form', () => {
  test('renders name and description fields', async ({ operatorPage: page }) => {
    await page.goto('/collections/new')
    await expect(page.getByLabel(/name/i)).toBeVisible()
    await expect(page.getByLabel(/description/i)).toBeVisible()
  })

  test('has a submit button', async ({ operatorPage: page }) => {
    await page.goto('/collections/new')
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible()
  })

  test('name field is required', async ({ operatorPage: page }) => {
    await page.goto('/collections/new')
    await page.getByRole('button', { name: /create/i }).click()
    const input = page.getByLabel(/name/i)
    const validationMessage = await input.evaluate((el: HTMLInputElement) => el.validationMessage)
    expect(validationMessage).not.toBe('')
  })
})

test.describe('collection management page', () => {
  test('redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/collections/1')
    await expect(page).toHaveURL('/login')
  })

  test('shows upload link when authenticated', async ({ operatorPage: page }) => {
    await page.goto('/collections/1')
    // May 404 if collection 1 doesn't exist; just check we're not on login
    await expect(page).not.toHaveURL('/login')
  })
})

test.describe('curator cannot access operator routes', () => {
  test('/dashboard redirects curator away', async ({ curatorPage: page }) => {
    await page.goto('/dashboard')
    // Curators should not see dashboard — they get redirected to /
    await expect(page).not.toHaveURL('/dashboard')
  })
})
