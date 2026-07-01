# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: abandon-session.spec.ts >> abandon sorting session >> Abandon removes the active sorting session from the dashboard
- Location: e2e/abandon-session.spec.ts:15:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByText('Active session')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByText('Active session')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "Adored home" [ref=e5]:
          - /url: /collections
          - generic [ref=e6]: Adored
        - button "Switch to dark theme" [ref=e8] [cursor=pointer]:
          - generic [ref=e9]: ☀
    - main [ref=e10]:
      - generic [ref=e11]:
        - navigation [ref=e13]:
          - link "Collections" [ref=e15]:
            - /url: /collections
          - generic [ref=e16]:
            - generic [ref=e17]: /
            - generic [ref=e18]: E2E Triage Bags
        - generic [ref=e19]:
          - generic [ref=e20]:
            - heading "E2E Triage Bags" [level=1] [ref=e21]
            - paragraph [ref=e22]: Created 7/1/2026
          - region "Items" [ref=e23]:
            - generic [ref=e24]:
              - generic [ref=e25]:
                - heading "Items" [level=2] [ref=e26]
                - paragraph [ref=e27]: Things gathered here
              - generic [ref=e28]:
                - link "Add photos" [ref=e29]:
                  - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/pool
                - generic [ref=e30]:
                  - link "Add item" [ref=e31]:
                    - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/items/new
                  - link "View all items" [ref=e32]:
                    - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/items
            - list [ref=e33]:
              - listitem [ref=e34]:
                - generic [ref=e35] [cursor=pointer]:
                  - img "#1" [ref=e37]
                  - generic [ref=e39]:
                    - heading "#1" [level=3] [ref=e41]
                    - paragraph [ref=e42]: Add a name
                  - link "#1" [ref=e43]:
                    - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/items/1
          - region "Continue" [ref=e44]:
            - heading "Continue" [level=2] [ref=e45]
            - generic [ref=e47]:
              - generic [ref=e48]:
                - generic [ref=e49]:
                  - heading "Active session" [level=2] [ref=e50]
                  - generic [ref=e51]: active
                - paragraph [ref=e52]: Preference discovery
              - group "Set this session aside" [ref=e54]:
                - generic [ref=e55]:
                  - generic [ref=e56]: Set this session aside?
                  - button "Never mind" [disabled] [ref=e57]
                  - button "Setting aside…" [disabled] [ref=e58]
            - navigation "Sorting and results" [ref=e59]:
              - link "Results" [ref=e60]:
                - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/results
          - navigation "Owner utilities" [ref=e61]:
            - link "Collection settings" [ref=e62]:
              - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/edit
            - link "Members" [ref=e63]:
              - /url: /collections/e2e-triage-bags-col_01kwfazj4b0prk0dfvh12nmyy3/members
    - contentinfo [ref=e64]:
      - paragraph [ref=e65]: Adored · Find the things you love
  - alert [ref=e66]
```

# Test source

```ts
  1  | // Un-mocked seam: click Abandon on the dashboard → DELETE /api/sessions/[id] →
  2  | // soft-delete → the active-session card is gone after the refresh. Proves the
  3  | // wiring the unit test can't (the button was previously inert).
  4  | import { test, expect } from "@playwright/test";
  5  | import { seedBaseline, seedTriageScenario } from "./fixtures/seed";
  6  | 
  7  | test.describe("abandon sorting session", () => {
  8  |   let slug: string;
  9  | 
  10 |   test.beforeAll(async () => {
  11 |     const ownerId = await seedBaseline();
  12 |     ({ slug } = await seedTriageScenario(ownerId));
  13 |   });
  14 | 
  15 |   test("Abandon removes the active sorting session from the dashboard", async ({ page }) => {
  16 |     await page.goto(`/collections/${slug}`);
  17 |     await expect(page.getByText("Active session")).toBeVisible();
  18 | 
  19 |     // First click reveals the confirm; it must NOT delete on its own.
  20 |     await page.getByRole("button", { name: /^set aside$/i }).click();
  21 |     await expect(page.getByText(/set this session aside\?/i)).toBeVisible();
  22 |     await expect(page.getByText("Active session")).toBeVisible();
  23 | 
  24 |     // Confirm → the card is gone after the server refresh.
  25 |     await page.getByRole("button", { name: /^set aside$/i }).click();
> 26 |     await expect(page.getByText("Active session")).toHaveCount(0);
     |                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  27 |   });
  28 | });
  29 | 
```