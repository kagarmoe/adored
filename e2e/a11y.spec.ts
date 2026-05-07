import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { test as authTest } from './fixtures'

// Helper: run axe and assert no violations
async function checkA11y(page: import('@playwright/test').Page, options?: { exclude?: string[] }) {
  const builder = new AxeBuilder({ page })
  if (options?.exclude) options.exclude.forEach(sel => builder.exclude(sel))
  const results = await builder.analyze()
  expect(results.violations).toEqual([])
}

test.describe('public pages', () => {
  test('login page has no a11y violations', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await checkA11y(page)
  })

  test('login page: email label is associated with input', async ({ page }) => {
    await page.goto('/login')
    const input = page.getByLabel(/email/i)
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('type', 'email')
  })

  test('login page: submit button has accessible name', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /send link/i })).toBeVisible()
  })

  test('login page: heading landmark exists', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading')).toBeVisible()
  })
})

authTest.describe('operator pages', () => {
  authTest('dashboard has no a11y violations', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await checkA11y(page)
  })

  authTest('dashboard has main landmark', async ({ operatorPage: page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('main')).toBeVisible()
  })

  authTest('new collection form has no a11y violations', async ({ operatorPage: page }) => {
    await page.goto('/collections/new')
    await page.waitForLoadState('networkidle')
    await checkA11y(page)
  })

  authTest('new collection: all inputs have labels', async ({ operatorPage: page }) => {
    await page.goto('/collections/new')
    const inputs = await page.locator('input, textarea').all()
    for (const input of inputs) {
      // Each input should be reachable by a label
      const id = await input.getAttribute('id')
      if (id) {
        const label = page.locator(`label[for="${id}"]`)
        await expect(label).toBeVisible()
      }
    }
  })
})

authTest.describe('curator pages', () => {
  authTest('curator home has no a11y violations', async ({ curatorPage: page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await checkA11y(page)
  })

  authTest('curator home has main landmark', async ({ curatorPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
  })
})

test.describe('keyboard navigation', () => {
  test('login form is keyboard accessible', async ({ page }) => {
    await page.goto('/login')
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['INPUT', 'BUTTON', 'A']).toContain(focused)
  })

  test('login button submittable via Enter', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/email/i).press('Enter')
    await expect(page.getByText(/check your email/i)).toBeVisible()
  })
})

test.describe('color contrast and visual a11y', () => {
  test('login page passes axe color contrast rules', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
