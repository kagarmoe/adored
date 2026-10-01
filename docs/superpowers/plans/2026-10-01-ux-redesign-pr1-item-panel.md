# Adored UX redesign — PR 1 (tokens, card, item panel) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track each task as a bead (`bd`), never TodoWrite.

**Goal:** One item surface at `/collections/[id]/items/[itemNumber]` (carousel + thumbnail strip +
always-editable fields + "In your life" chip + overflow Archive/Delete), a card-grid items list with
search and pills, the Frosted shelf tokens with an AA gate that covers translucency, and redirects
for the retired `…/edit` and `…/photos` pages.

**Architecture:** Server Components read (item, photos, curator decision log, curator sessions) and
pass plain props to small client components that write only through existing API routes. The only
API contract change is `UpdateItemSchema` (strict, nullable clears, size/weight/unit). Archive is the
existing soft delete; the Archived pill reads soft-deleted rows through one new repository method.
Glass is CSS tokens; every translucent token ships hex composites the contrast test asserts.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/Postgres, Tailwind 4 (`@theme inline`),
zod 4, vitest + Testing Library (jsdom), Playwright (WebKit tablet in CI), culori.

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` — PR 1 = §8 item 1
(§3, §5, the §7 rows for those, the e2e map check).

## Global Constraints (from the spec)

- "AA is guaranteed by the surface's own opacity, never by what is behind it." Glass-strong is
  ≥ 0.85 opaque; at most three glass-strong surfaces per screen; decorative glass has no
  backdrop-filter; grid cards use a pre-composited near-opaque fill with no backdrop-filter.
- "Per-component inline tints are banned." Use the named tokens only.
- Under `@supports not (backdrop-filter: blur(1px))` and `prefers-reduced-transparency: reduce`,
  every glass token resolves to its opaque surface token. Reduced motion only affects transitions.
- Keep `primary #004a67` (light) and the existing dark primary. Marigold stays the one spark.
- Items: no new columns. Photos: no new columns; cover = hero flag; order = hero first, then upload
  order. Archive = soft delete. Delete = the existing purge (owner only, 409 if in a ranking).
- Fields: one form, one quiet Save when changed, route-leave guard while unsaved, soft prompts for
  empty fields, never a count of what is missing, blank Name reverts with "Give it a name to save".
- Tablet-first, tap-first, 44px targets, swipe only where native (the carousel). Colour is never
  the only signal (a selected pill shows a border plus a check).
- Vocabulary: no prices/carts/offers; "Set aside" is reserved for Not mine — never use it here.
- Every test runs in CI; DB tier only for real DB crossings; one un-mocked crossing per route.
- Commits end with the session attribution lines from the current system reminder. Do not push.

## Review Focus — five uncovered input classes (each pinned in its owning task)

1. **Unknown keys in the item PATCH body** (`deletedAt`, `collectionId`, typos) — today stripped
   silently; must be 400 with nothing written. Pinned: Task 3, `items.test.ts` "rejects an unknown key".
2. **Out-of-domain measures** — negative, `1e400` (JSON parses it to `Infinity`), numeric strings.
   Pinned: Task 3, the three measure rows of the rejection table.
3. **Blank text vs clear** — `""`/whitespace must persist as `null` for optional text, and a
   whitespace-only `name` must be rejected server-side and reverted client-side. Pinned: Task 3
   "treats a blank string as a clear" + "rejects a whitespace-only name"; Task 4 "blank name reverts".
4. **Non-numeric `itemNumber` on the retired `edit`/`photos` routes** (`../x`, `1%3Fx`) — must never
   be interpolated into the redirect target. Pinned: Task 8 enumeration test "edit/photos redirect
   to the panel; a non-numeric number goes to the list".
5. **Search `q` with regex metacharacters or excessive length** — plain substring match, capped at
   100 chars. Pinned: Task 7 `items.test.ts` "treats q as plain text".

Decisions this plan takes where the spec is silent (call them out in review):
- The chip writes through `POST /api/sessions/[id]/decisions`, which needs an in-progress session.
  The page passes the curator's active/paused session; with none, the chip creates one with
  `POST /api/sessions` on first tap. Once set, the chip toggles between its two answers; there is
  no "unset" write (that would be a new decision type, a spec non-goal).
- "+ Add photos" reuses `PoolUpload` unchanged on the wire: files go to the pool, then the
  uploader matches the new pool rows by blob `pathname` and moves them with the existing
  `POST …/photos/reassign` (`destination: item`). No new API. Rows whose Blob callback is late stay
  in the pool and the uploader says so.
- The zoom view stays on the existing corner "View photo" control (one trigger, no duplicate).
- "Selected pill not colour-only" (§7 says e2e a11y) is proven at the unit tier
  (`ItemFilterPills.test.tsx`: `aria-current` + check glyph); axe still scans the list in a11y.
- "Make cover leaves exactly one hero" keeps its existing DB test untouched (no new test).

Deleted (each in the task that replaces it): `ItemMetadata`, `PhotoDeleteControl`, `ItemDeleteControl`,
`ItemFilters`, `ItemEditForm`, `PhotoUpload` (+ their tests); `e2e/{item-page,delete-photo,image-rotate,delete-item}.spec.ts`.

---

## Task 1: Glass tokens, composited hexes, contrast gate, DESIGN.md

**Files:** Modify `src/app/globals.css:11-79` (`@theme inline`), `:92-171` (`:root`), `:173-237`
(dark), `:251-262` (`body`); add fallback blocks after line 237. Modify
`src/lib/design/contrast.test.ts:42-48, 63-97`, append a describe. Modify `DESIGN.md` (front matter,
§2, §4, §5). Test: `src/lib/design/contrast.test.ts`.

**Interfaces:** Produces CSS tokens `--color-{ground-aqua,ground-mint,card,rim,chip,chip-ink,glass,glass-strong}`,
composites `--color-glass-on-{aqua,mint}`, `--color-glass-strong-on-{aqua,mint,black,white}`,
`--ground-wash`, Tailwind utilities `bg-card bg-glass bg-glass-strong border-rim bg-chip text-chip-ink
rounded-pill`, `--radius-card: 20px`. Consumes nothing.

- [ ] **Step 1: Failing test.** In `contrast.test.ts` replace lines 42-43 with named selectors and
  extend `pairings()`; append the drift guard:

```ts
const LIGHT = /:root\s*\{([^}]*)\}/;
const DARK = /\[data-theme="dark"\]\s*\{([^}]*)\}/;
const lightScope = scopeVars(LIGHT);
const darkScope = scopeVars(DARK);
```

Append inside the array returned by `pairings(t)` (after the ring pairs):

```ts
    [t.ink, t.groundAqua, 4.5, "ink on ground wash (aqua stop)"],
    [t.ink, t.groundMint, 4.5, "ink on ground wash (mint stop)"],
    [t.inkSoft, t.groundAqua, 4.5, "ink-soft on aqua stop"],
    [t.inkSoft, t.groundMint, 4.5, "ink-soft on mint stop"],
    [t.primary, t.groundAqua, 4.5, "primary link on aqua stop"],
    [t.primary, t.groundMint, 4.5, "primary link on mint stop"],
    [t.ink, t.card, 4.5, "ink on card"],
    [t.inkSoft, t.card, 4.5, "ink-soft on card"],
    [t.primary, t.card, 4.5, "primary link on card"],
    [t.chipInk, t.chip, 4.5, "chip ink on chip (selected pill / chip)"],
    [t.primary, t.chip, 3.0, "selected border (primary) on chip"],
    ...GLASS_COMPOSITES.flatMap((k): [string, string, number, string][] => [
      [t.ink, t[k], 4.5, `ink on ${k}`],
      [t.inkSoft, t[k], 4.5, `ink-soft on ${k}`],
      // Text on glass is ink/ink-soft; primary on glass marks controls only (DESIGN §2).
      [t.primary, t[k], 3.0, `primary control edge on ${k}`],
    ]),
```

Put `GLASS_COMPOSITES` above `pairings` (the AA describe calls `pairings()` at collection
time, so a later `const` would hit the TDZ); append everything after it to the end of the file:

```ts
const GLASS_COMPOSITES = [
  "glassOnAqua", "glassOnMint",
  "glassStrongOnAqua", "glassStrongOnMint", "glassStrongOnBlack", "glassStrongOnWhite",
] as const;
// Translucent tokens are `rgb(R G B / A)` — the hex parser skips them, so read them here and
// prove each declared composite really is that token over that backdrop (±1 per channel).
const RGBA = /--color-(glass(?:-strong)?)\s*:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)\s*;/g;
function translucent(selector: RegExp): Record<string, { rgb: number[]; a: number }> {
  const out: Record<string, { rgb: number[]; a: number }> = {};
  for (const m of css.match(selector)![1].matchAll(RGBA)) {
    out[m[1]] = { rgb: [+m[2], +m[3], +m[4]], a: +m[5] };
  }
  return out;
}
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
describe("glass composites match their translucent tokens (drift guard)", () => {
  for (const [theme, selector, t] of [["light", LIGHT, light], ["dark", DARK, dark]] as const) {
    const g = translucent(selector);
    it(`${theme}: declares glass + glass-strong, glass-strong >= 0.85 opaque`, () => {
      expect(Object.keys(g).sort()).toEqual(["glass", "glass-strong"]);
      expect(g["glass-strong"].a).toBeGreaterThanOrEqual(0.85);
    });
    const cases: [keyof typeof g, string, (typeof GLASS_COMPOSITES)[number]][] = [
      ["glass", t.groundAqua, "glassOnAqua"],
      ["glass", t.groundMint, "glassOnMint"],
      ["glass-strong", t.groundAqua, "glassStrongOnAqua"],
      ["glass-strong", t.groundMint, "glassStrongOnMint"],
      ["glass-strong", "#000000", "glassStrongOnBlack"],
      ["glass-strong", "#ffffff", "glassStrongOnWhite"],
    ];
    for (const [token, backdrop, composite] of cases) {
      it(`${theme}: ${composite} is ${token} over ${backdrop}`, () => {
        const { rgb, a } = g[token];
        const expected = rgbOf(backdrop).map((b, i) => a * rgb[i] + (1 - a) * b);
        rgbOf(t[composite]).forEach((c, i) => expect(Math.abs(c - expected[i])).toBeLessThanOrEqual(1));
      });
    }
  }
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run src/lib/design/contrast.test.ts` → FAIL
  `globals.css: no --color var for token "groundAqua"` and the drift-guard `toEqual` fails on `[]`.

- [ ] **Step 3: Implement tokens.** In `globals.css` `@theme inline`, change `--radius-card: 16px;`
  to `20px` and add:

```css
  --color-card: var(--color-card);
  --color-glass: var(--color-glass);
  --color-glass-strong: var(--color-glass-strong);
  --color-rim: var(--color-rim);
  --color-chip: var(--color-chip);
  --color-chip-ink: var(--color-chip-ink);
  --radius-pill: 999px;
```

At the end of `:root` (before `}` at line 171):

```css
  /* Frosted shelf (spec 2026-10-01 §5). AA comes from each surface's own opacity,
   * never from what sits behind it. Translucent tokens are rgb()/alpha; each has hex
   * composites (over both ground stops, and black/white for glass-strong) that
   * contrast.test.ts asserts text against and proves against the alpha. */
  --color-ground-aqua: #cfe6ec;
  --color-ground-mint: #d5ebe1;
  --ground-wash: radial-gradient(120% 80% at 10% 0%, var(--color-ground-aqua), transparent 60%),
    radial-gradient(120% 80% at 90% 100%, var(--color-ground-mint), transparent 60%),
    var(--color-ground);
  --color-card: #fbfcfc; /* surface-raised @ 0.9 over ground, pre-composited */
  --color-rim: #ffffff;
  --color-chip: #e3eef1;
  --color-chip-ink: #16242b;
  --color-glass: rgb(255 255 255 / 0.5);
  --color-glass-strong: rgb(255 255 255 / 0.88);
  --color-glass-on-aqua: #e7f3f6;
  --color-glass-on-mint: #eaf5f0;
  --color-glass-strong-on-aqua: #f9fcfd;
  --color-glass-strong-on-mint: #fafdfb;
  --color-glass-strong-on-black: #e0e0e0;
  --color-glass-strong-on-white: #ffffff;
```

At the end of `[data-theme="dark"]` (before its `}`):

```css
  --color-ground-aqua: #022a33;
  --color-ground-mint: #03261f;
  --color-card: #10374a;
  --color-rim: #3f7fa0;
  --color-chip: #173f4d;
  --color-chip-ink: #ecf2f4;
  /* 0.92, not 0.85: over a white photo 0.85 leaves ink-soft under AA. */
  --color-glass: rgb(16 63 74 / 0.5);
  --color-glass-strong: rgb(16 63 74 / 0.92);
  --color-glass-on-aqua: #09353f;
  --color-glass-on-mint: #0a3335;
  --color-glass-strong-on-aqua: #0f3d48;
  --color-glass-strong-on-mint: #0f3d47;
  --color-glass-strong-on-black: #0f3a44;
  --color-glass-strong-on-white: #234e58;
```

After the dark block (selectors with a comma so the test's `:root\s*\{` parser never matches them):

```css
@supports not (backdrop-filter: blur(1px)) {
  :root, [data-theme="dark"] {
    --color-glass: var(--color-surface);
    --color-glass-strong: var(--color-surface-raised);
  }
}
@media (prefers-reduced-transparency: reduce) {
  :root, [data-theme="dark"] {
    --color-glass: var(--color-surface);
    --color-glass-strong: var(--color-surface-raised);
  }
}
```

In `@layer base` `body`, replace `background: var(--color-ground);` with `background: var(--ground-wash);`.

- [ ] **Step 4: Run, expect pass.** `npx vitest run src/lib/design/contrast.test.ts` → PASS
  (parity guard still green: every new hex token exists in both scopes).

- [ ] **Step 5: DESIGN.md amendments.** Front matter: add colours `ground-aqua: "#cfe6ec"`,
  `ground-mint: "#d5ebe1"`, `card: "#fbfcfc"`, `rim: "#ffffff"`, `chip: "#e3eef1"`, `chip-ink:
  "#16242b"`; `rounded:` becomes `control: "10px"  # textareas, menus` / `pill: "999px"  # buttons,
  inputs, chips` / `card: "20px"` / `full: "999px"`. §2: add a "### Glass (Frosted shelf)" subsection
  stating the opacity principle verbatim, the three surface kinds (glass-strong ≥ 0.85 with blur, at
  most three per screen; decorative glass ~0.5 with no blur, only over the static wash; cards
  pre-composited, no blur), the fallbacks, the ground wash's two stops, "text on glass is ink or
  ink-soft; primary on glass marks controls (borders, icons, focus), never text", and "composites
  are declared in `globals.css` and gated by `contrast.test.ts`". §4: "Flat by default" paragraph
  gains "Glass surfaces lift by translucency + rim (`--color-rim`) instead of shadow alone." §5:
  Buttons "pill radius (`rounded-pill`)"; Inputs "pill radius; textareas keep 10px"; Cards "20px
  radius, `card` fill (pre-composited), hairline + soft shadow, no backdrop-filter"; add bullets
  "**Glass panel:** `Card variant=\"glass\"` — glass-strong + blur + rim; the item panel's fields side"
  and "**Filter pills / chips:** `rounded-pill`, 44px; selected = `chip` fill + primary border + a
  check glyph, never colour alone". Theme names stay Sea Glass / Sea Glass at Night. ("No swiping"
  is already gone from DESIGN.md — verify with a search; nothing to remove.)

- [ ] **Step 6: Commit.** `git add src/app/globals.css src/lib/design/contrast.test.ts DESIGN.md &&
  git commit -m "feat(design): frosted shelf glass tokens with composited AA gate"`

## Task 2: Card primitive + pill controls

**Files:** Modify `src/components/ui/Card.tsx:3-31`, `Button.tsx:5`, `Input.tsx:24`,
`Select.tsx:26`. Create `src/components/ui/Card.test.tsx`.

**Interfaces:** Produces `Card` prop `variant?: "card" | "glass"` (default `"card"`). Consumes Task 1 utilities.

- [ ] **Step 1: Failing test** `src/components/ui/Card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";
describe("Card", () => {
  it("grid cards carry no backdrop-filter; only the glass panel blurs (spec §5: cheap grids)", () => {
    render(<><Card data-testid="card">a</Card><Card data-testid="glass" variant="glass">b</Card></>);
    const card = screen.getByTestId("card").className;
    const glass = screen.getByTestId("glass").className;
    expect(card).toMatch(/\bbg-card\b/);
    expect(card).not.toMatch(/backdrop-/);
    expect(glass).toMatch(/\bbg-glass-strong\b/);
    expect(glass).toMatch(/\bbackdrop-blur/);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/ui/Card.test.tsx` → FAIL (`bg-surface`, no `variant`).

- [ ] **Step 3: Implement.** `Card.tsx`:

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "md" | "lg" | "none";
  interactive?: boolean;
  /** "card": grid/list tile, opaque pre-composited fill, no blur (cheap to scroll).
   *  "glass": a text-carrying panel over photos/scroll — glass-strong + blur + rim. */
  variant?: "card" | "glass";
}
const surfaceMap = {
  card: "bg-card shadow-card border border-hairline",
  glass: "bg-glass-strong backdrop-blur-xl shadow-lift border border-rim",
};
```

and in the render use `rounded-card ${surfaceMap[variant]}` in place of
`rounded-card bg-surface shadow-card border border-hairline`, destructuring `variant = "card"`.
In `Button.tsx:5`, `Input.tsx:24`, `Select.tsx:26` replace `rounded-control` with `rounded-pill`
(Textarea keeps `rounded-control`).

- [ ] **Step 4:** `npx vitest run src/components/ui` → PASS.
- [ ] **Step 5:** `git add src/components/ui && git commit -m "feat(ui): card variants and pill controls"`

## Task 3: Strict item update schema (size, weight, unit, nullable clears)

**Files:** Modify `src/server/api/items.ts:21-31, 76-79`. Create `src/server/api/items.test.ts`.
Modify `src/lib/db/collection-items-routes.integration.test.ts` (imports at :42-47; new describe after :229 block).

**Interfaces:** Produces the PATCH body contract
`{ name?: string; brand|style|color|material|category|notes|story?: string | null; status?: string;
height|width|depth|weight?: number | null; unit?: "imperial" | "metric" }` (strict). Consumed by
`PATCH /api/collections/[id]/items/[itemId]` and `PATCH /api/items/[id]` (both call
`ItemController.updateItem`).

- [ ] **Step 1: Failing unit test** `src/server/api/items.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ItemController } from "./items";
import type { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
function setup() {
  const update = vi.fn(async (_id: string, data: object) => data);
  return { update, ctl: new ItemController({ update } as unknown as ItemRepository) };
}
describe("ItemController.updateItem", () => {
  it("persists size, weight and unit as numeric strings and leaves unsent fields alone", async () => {
    const { update, ctl } = setup();
    await ctl.updateItem("i1", { height: 30, width: 12.5, depth: 0, weight: 1.2, unit: "metric" });
    const written = update.mock.calls[0][1] as Record<string, unknown>;
    expect(written).toMatchObject({ height: "30", width: "12.5", depth: "0", weight: "1.2", unit: "metric" });
    expect(written.name).toBeUndefined();
  });
  it("clears with null and treats a blank string as a clear", async () => {
    const { update, ctl } = setup();
    await ctl.updateItem("i1", { brand: null, notes: "   ", story: "", height: null });
    expect(update.mock.calls[0][1]).toMatchObject({ brand: null, notes: null, story: null, height: null });
  });
  it.each([
    ["an unknown key", { brand: "x", deletedAt: null }],
    ["a negative measure", { height: -1 }],
    ["an infinite measure (1e400 parses to Infinity)", JSON.parse('{"height":1e400}')],
    ["a numeric string measure", { weight: "12" }],
    ["an out-of-set unit", { unit: "furlongs" }],
    ["a null unit (column is NOT NULL)", { unit: null }],
    ["a whitespace-only name", { name: "   " }],
  ])("rejects %s and writes nothing", async (_label, body) => {
    const { update, ctl } = setup();
    await expect(ctl.updateItem("i1", body)).rejects.toBeInstanceOf(ZodError);
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/server/api/items.test.ts` → FAIL (numbers not mapped, unknown
  key/`unit`/measures accepted, `null` brand rejected).

- [ ] **Step 3: Implement** in `items.ts` (replace lines 21-31 and `updateItem`):

```ts
// Strict: an unknown key is a 400, never a silent 200 (spec §3). Text clears persist as
// null; a blank string is a clear. Measures are numbers on the wire, numeric strings in
// the DB (drizzle `numeric`). zod 4's z.number() already rejects NaN/Infinity.
const clearableText = (max: number) =>
  z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();
const measure = z.number().nonnegative().max(100_000).nullable().optional();
const UpdateItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  brand: clearableText(200),
  style: clearableText(200),
  color: clearableText(200),
  material: clearableText(200),
  category: clearableText(200),
  status: z.string().optional(),
  notes: clearableText(5000),
  story: clearableText(2000),
  height: measure,
  width: measure,
  depth: measure,
  weight: measure,
  unit: z.enum(["imperial", "metric"]).optional(),
});
const toNumeric = (n: number | null | undefined) =>
  n === undefined ? undefined : n === null ? null : String(n);
```

```ts
  async updateItem(itemId: string, data: unknown): Promise<Item> {
    const { height, width, depth, weight, ...rest } = UpdateItemSchema.parse(data);
    return this.itemRepo.update(itemId, {
      ...rest,
      height: toNumeric(height),
      width: toNumeric(width),
      depth: toNumeric(depth),
      weight: toNumeric(weight),
    });
  }
```

(Drizzle skips `undefined` in `.set()`, so unsent fields are untouched.)

- [ ] **Step 4:** `npx vitest run src/server/api/items.test.ts` → PASS.

- [ ] **Step 5: One un-mocked crossing** for the route the panel uses. In
  `collection-items-routes.integration.test.ts` add
  `import { PATCH as patchCollectionItem } from "@/app/api/collections/[id]/items/[itemId]/route";`
  beside the other route imports, and after the `PATCH /api/items/[id]` describe:

```ts
  describe("PATCH /api/collections/[id]/items/[itemId] (item panel save)", () => {
    it("persists size, weight, unit and a cleared brand through the real route and DB", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Tote", brand: "Coach" });
      expect((await new ItemRepository(db).findById(item.id))!.brand).toBe("Coach"); // present before
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await patchCollectionItem(
        jsonReq("PATCH", { height: 30, weight: 1.2, unit: "metric", brand: null }) as any,
        { params: Promise.resolve({ id: collectionId, itemId: item.id }) } as any,
      );
      expect(res.status).toBe(200);
      const after = await new ItemRepository(db).findById(item.id);
      expect(after).toMatchObject({ height: "30", weight: "1.2", unit: "metric", brand: null, name: "Tote" });
    });
  });
```

- [ ] **Step 6:** `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/collection-items-routes.integration.test.ts`
  → PASS (and before Step 3 this test fails with 400 on `brand: null`). `npm run lint`.
- [ ] **Step 7:** `git add src/server/api/items.ts src/server/api/items.test.ts src/lib/db/collection-items-routes.integration.test.ts && git commit -m "feat(api): strict item update with size, weight, unit and clears"`

## Task 4: Panel fields form, leave guard, "In your life" chip, panel page

**Files:** Create `src/features/items/item-panel-fields.ts` (+`.test.ts`), `useLeaveGuard.ts`
(+`.test.tsx`), `ItemPanelForm.tsx` (+`.test.tsx`), `InYourLifeChip.tsx` (+`.test.tsx`). Modify
`src/lib/items.ts` (add `itemSubtitle`) + `src/lib/items.test.ts`; rewrite
`src/app/collections/[id]/items/[itemNumber]/page.tsx:1-151`. Delete `ItemMetadata.tsx` + test.

**Interfaces:**
- `item-panel-fields.ts` produces `type Unit = "imperial" | "metric"`, `type PanelFields`,
  `fieldsFromItem(item: Item): PanelFields`, `isDirty(a: PanelFields, b: PanelFields): boolean`,
  `buildItemPatch(saved: PanelFields, current: PanelFields): { ok: true; patch: ItemPatch } | { ok: false; reason: "blank-name" }`,
  `NAME_NEEDED = "Give it a name to save"`.
- `useLeaveGuard(active: boolean): void`, `LEAVE_PROMPT: string`.
- `ItemPanelForm({ item: Item; collectionId: string })` — PATCHes `/api/collections/${collectionId}/items/${item.id}` (collection **id**, not slug).
- `InYourLifeChip({ collectionId: string; itemId: string; sessionId: string | null; initial?: UsageAnswer })`.
- `itemSubtitle(item: { number: number | null; createdAt: Date }, now: Date): string`.

- [ ] **Step 1: Failing tests.** `src/features/items/item-panel-fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildItemPatch, type PanelFields } from "./item-panel-fields";
const base: PanelFields = {
  name: "Tote", brand: "Coach", style: "", color: "", material: "", category: "", notes: "",
  story: "", height: "", width: "", depth: "", weight: "2", unit: "imperial",
};
describe("buildItemPatch", () => {
  it("sends only changed fields: trimmed text, null clears, numbers, unit", () => {
    const r = buildItemPatch(base, { ...base, brand: "", style: " Hobo ", height: "30", weight: "", unit: "metric" });
    expect(r).toEqual({ ok: true, patch: { brand: null, style: "Hobo", height: 30, weight: null, unit: "metric" } });
  });
  it("refuses a blank name instead of sending it", () => {
    expect(buildItemPatch(base, { ...base, name: "  " })).toEqual({ ok: false, reason: "blank-name" });
  });
});
```

`src/features/items/useLeaveGuard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useLeaveGuard } from "./useLeaveGuard";
function Harness({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return <a href="/collections/x/items">Items</a>;
}
const click = (el: Element) => {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ev);
  return ev;
};
afterEach(() => vi.restoreAllMocks());
describe("useLeaveGuard", () => {
  it("while unsaved: blocks an in-app link the person declines to leave by, and warns on unload", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByText } = render(<Harness active />);
    expect(click(getByText("Items")).defaultPrevented).toBe(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
  it("lets the link through when the person confirms, and does nothing when saved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByText, rerender } = render(<Harness active />);
    expect(click(getByText("Items")).defaultPrevented).toBe(false);
    confirm.mockClear();
    rerender(<Harness active={false} />);
    click(getByText("Items"));
    expect(confirm).not.toHaveBeenCalled();
  });
});
```

`src/features/items/ItemPanelForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { ItemPanelForm } from "./ItemPanelForm";
const item = {
  id: "i1", collectionId: "c1", name: "Tote", brand: null, style: null, color: null, material: null,
  category: null, number: 3, height: null, width: null, depth: null, weight: null, unit: "imperial",
  status: null, notes: null, story: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
} as Item;
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never; });
describe("ItemPanelForm", () => {
  it("shows Save only once something changed, and PATCHes just the change", async () => {
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toHaveAttribute("placeholder", "Add a brand");
    await user.type(screen.getByLabelText("Brand"), "Coach");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/c1/items/i1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ brand: "Coach" }) }),
    ));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });
  it("blank name reverts to the previous name with a gentle line", async () => {
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.clear(screen.getByLabelText("Name"));
    await user.tab();
    expect(screen.getByLabelText("Name")).toHaveValue("Tote");
    expect(screen.getByText("Give it a name to save")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("a failed save keeps the changes and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.type(screen.getByLabelText("Notes"), "Gift");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/didn.t save/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Notes")).toHaveValue("Gift");
  });
});
```

`src/features/items/InYourLifeChip.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InYourLifeChip } from "./InYourLifeChip";
const ok = (body: unknown = {}) => ({ ok: true, json: async () => body });
beforeEach(() => { global.fetch = vi.fn().mockResolvedValue(ok()) as never; });
describe("InYourLifeChip", () => {
  it("starts unset and writes nothing until tapped", () => {
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("tapping writes a usage decision to the curator's open session", async () => {
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    expect(screen.getByRole("button", { name: "Resting" })).toHaveAttribute("aria-pressed", "true");
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/s1/decisions");
    expect(JSON.parse(init.body)).toMatchObject({ type: "usage", decision: { itemId: "i1", result: "not_uses" } });
  });
  it("with no open session, starts one first, then records the decision there", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(ok({ id: "s9" })).mockResolvedValue(ok()) as never;
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "I use this" }));
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("/api/sessions");
    expect(JSON.parse(calls[0][1].body)).toEqual({ collectionId: "c1" });
    await waitFor(() => expect(calls[1][0]).toBe("/api/sessions/s9/decisions"));
  });
  it("a failed write puts the chip back and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" initial="uses" />);
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    await waitFor(() => expect(screen.getByText(/didn.t save/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
  });
});
```

Add to `src/lib/items.test.ts`:

```ts
describe("itemSubtitle", () => {
  it("names the month added, adding the year only when it isn't this year", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(itemSubtitle({ number: 14, createdAt: new Date("2026-06-03T12:00:00Z") }, now)).toBe("#14 · added in June");
    expect(itemSubtitle({ number: 2, createdAt: new Date("2025-06-03T12:00:00Z") }, now)).toBe("#2 · added in June 2025");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/features/items src/lib/items.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement.** `src/features/items/item-panel-fields.ts`:

```ts
import type { Item } from "@/types";
export const NAME_NEEDED = "Give it a name to save";
const TEXT = ["name", "brand", "style", "color", "material", "category", "notes", "story"] as const;
const MEASURES = ["height", "width", "depth", "weight"] as const;
type TextField = (typeof TEXT)[number];
type Measure = (typeof MEASURES)[number];
export type Unit = "imperial" | "metric";
export type PanelFields = Record<TextField | Measure, string> & { unit: Unit };
export type ItemPatch = { name?: string; unit?: Unit } & Partial<Record<Exclude<TextField, "name">, string | null>> &
  Partial<Record<Measure, number | null>>;
export function fieldsFromItem(item: Item): PanelFields {
  const s = (v: string | null) => v ?? "";
  return {
    name: s(item.name), brand: s(item.brand), style: s(item.style), color: s(item.color),
    material: s(item.material), category: s(item.category), notes: s(item.notes), story: s(item.story),
    height: s(item.height), width: s(item.width), depth: s(item.depth), weight: s(item.weight),
    // Legacy rows hold "in"; anything that isn't metric reads as imperial.
    unit: item.unit === "metric" ? "metric" : "imperial",
  };
}
export const isDirty = (a: PanelFields, b: PanelFields) =>
  (Object.keys(a) as (keyof PanelFields)[]).some((k) => a[k] !== b[k]);
export function buildItemPatch(
  saved: PanelFields,
  current: PanelFields,
): { ok: true; patch: ItemPatch } | { ok: false; reason: "blank-name" } {
  const patch: ItemPatch = {};
  for (const f of TEXT) {
    if (current[f] === saved[f]) continue;
    const v = current[f].trim();
    if (f === "name") {
      if (!v) return { ok: false, reason: "blank-name" };
      patch.name = v;
    } else patch[f] = v === "" ? null : v;
  }
  for (const f of MEASURES) {
    if (current[f] !== saved[f]) patch[f] = current[f].trim() === "" ? null : Number(current[f]);
  }
  if (current.unit !== saved.unit) patch.unit = current.unit;
  return { ok: true, patch };
}
```

`src/features/items/useLeaveGuard.ts`:

```ts
"use client";
import { useEffect } from "react";
export const LEAVE_PROMPT = "You have changes that aren't saved yet. Leave anyway?";
// App Router has no route-change event, so guard the two ways out: a full unload, and a
// same-origin link click (caught in the capture phase, before Next's <Link> handler).
// Browser Back is not covered; the unsaved Save button stays visible as the cue.
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (!window.confirm(LEAVE_PROMPT)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);
}
```

`src/features/items/ItemPanelForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import type { Item } from "@/types";
import { buildItemPatch, fieldsFromItem, isDirty, NAME_NEEDED, type PanelFields } from "./item-panel-fields";
import { useLeaveGuard } from "./useLeaveGuard";
const TEXT_INPUTS = [
  ["brand", "Brand", "Add a brand"], ["style", "Style", "Add a style"], ["color", "Colour", "Add a colour"],
  ["material", "Material", "Add a material"], ["category", "Category", "Add a category"],
] as const;
export function ItemPanelForm({ item, collectionId }: { item: Item; collectionId: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => fieldsFromItem(item));
  const [fields, setFields] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dirty = isDirty(saved, fields);
  useLeaveGuard(dirty);
  const set = (k: keyof PanelFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));
  const revertName = () => {
    setFields((f) => ({ ...f, name: saved.name }));
    setNote(NAME_NEEDED);
  };
  const len = fields.unit === "metric" ? "cm" : "in";
  const wt = fields.unit === "metric" ? "kg" : "lb";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = buildItemPatch(saved, fields);
    if (!result.ok) return revertName();
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.patch),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(fields);
      setNote("Saved.");
      router.refresh();
    } catch {
      setNote("That didn't save — your changes are still here; try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} aria-label="Details" className="space-y-4">
      <Input
        name="name" label="Name" value={fields.name} onChange={set("name")} maxLength={200}
        placeholder="Give it a name"
        onBlur={() => { if (fields.name !== saved.name && !fields.name.trim()) revertName(); }}
      />
      {TEXT_INPUTS.map(([k, label, prompt]) => (
        <Input key={k} name={k} label={label} value={fields[k]} onChange={set(k)} placeholder={prompt} maxLength={200} />
      ))}
      <details className="rounded-card border border-hairline px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">Size</summary>
        <fieldset className="mt-2 flex gap-4">
          <legend className="sr-only">Units</legend>
          {(["imperial", "metric"] as const).map((u) => (
            <label key={u} className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="radio" name="unit" value={u} checked={fields.unit === u}
                onChange={() => setFields((f) => ({ ...f, unit: u }))} />
              {u === "metric" ? "cm · kg" : "in · lb"}
            </label>
          ))}
        </fieldset>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["height", "width", "depth"] as const).map((k) => (
            <Input key={k} name={k} type="number" inputMode="decimal" min={0} step="any" value={fields[k]}
              onChange={set(k)} label={`${k[0].toUpperCase()}${k.slice(1)} (${len})`} />
          ))}
          <Input name="weight" type="number" inputMode="decimal" min={0} step="any" value={fields.weight}
            onChange={set("weight")} label={`Weight (${wt})`} />
        </div>
      </details>
      <Textarea name="notes" label="Notes" value={fields.notes} onChange={set("notes")} placeholder="Add a note" maxLength={5000} />
      <Textarea name="story" label="Where will it go next?" value={fields.story} onChange={set("story")}
        placeholder="To my niece, who always borrowed it…" maxLength={2000} />
      {/* Mounted always: a live region must exist before its text changes. */}
      <p role="status" className="min-h-5 text-sm text-ink-soft">{note}</p>
      {dirty && <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
    </form>
  );
}
```

`src/features/items/InYourLifeChip.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import type { UsageAnswer } from "@/lib/derive-usage";
import { IN_LIFE_CHIP, RESTING_CHIP } from "./usage-chip-copy";
const OPTIONS: [UsageAnswer, string][] = [["uses", "I use this"], ["not_uses", RESTING_CHIP]];
const JSON_HEADERS = { "Content-Type": "application/json" };
interface Props { collectionId: string; itemId: string; sessionId: string | null; initial?: UsageAnswer }
// Tri-state: unset until tapped (untouched means no decision). Writes a `usage` event
// through the existing decision route; that route needs an in-progress session, so with
// none open the first tap starts one (POST /api/sessions, goal defaults server-side).
export function InYourLifeChip({ collectionId, itemId, sessionId, initial }: Props) {
  const labelId = useId();
  const [value, setValue] = useState(initial);
  const [sid, setSid] = useState(sessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(next: UsageAnswer) {
    if (busy || next === value) return;
    const prev = value;
    setValue(next);
    setBusy(true);
    setError("");
    try {
      let id = sid;
      if (!id) {
        const res = await fetch("/api/sessions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ collectionId }) });
        if (!res.ok) throw new Error("session");
        id = ((await res.json()) as { id: string }).id;
        setSid(id);
      }
      const res = await fetch(`/api/sessions/${id}/decisions`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ type: "usage", decision: { itemId, result: next } }),
      });
      if (!res.ok) throw new Error("decision");
    } catch {
      setValue(prev);
      setError("That didn't save — try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <p id={labelId} className="text-sm font-semibold text-ink">{IN_LIFE_CHIP}</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(([v, label]) => {
          const on = value === v;
          return (
            <button key={v} type="button" aria-pressed={on} onClick={() => choose(v)}
              className={`inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-sm transition-colors ${on ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline text-ink"}`}>
              {on && (
                <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {label}
            </button>
          );
        })}
      </div>
      <p role="status" className="text-sm text-ink-soft">{error}</p>
    </div>
  );
}
```

`src/lib/items.ts` — add:

```ts
/** "#14 · added in June" — the year appears only when it isn't the current one. */
export function itemSubtitle(item: { number: number | null; createdAt: Date }, now: Date): string {
  const d = new Date(item.createdAt);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const when = d.getUTCFullYear() === now.getUTCFullYear() ? month : `${month} ${d.getUTCFullYear()}`;
  return `${item.number != null ? `#${item.number} · ` : ""}added in ${when}`;
}
```

Rewrite the item page (`page.tsx`). Keep lines 1-4, 18-30 and 39-47 (auth, guard, item lookup)
as they are; drop the membership read (`requireCollectionAccess` already admits only owner or
member, so every viewer may modify), `ItemMetadata`, `ItemDeleteControl`, the keepsake card and the
Edit/Manage-photos links. Imports keep lines 1-6 and 8-9 (drop `MemberController`, `Button`,
`ItemDeleteControl`, `ItemMetadata`, `ViewerPhoto`, `Link`, `hasName`) and add:

```tsx
import { DecisionController } from "@/server/api/decisions";
import { SessionController } from "@/server/api/sessions";
import { Card } from "@/components/ui";
import { ItemPhotoCarousel } from "@/features/items/ItemPhotoCarousel";
import { ItemPanelForm } from "@/features/items/ItemPanelForm";
import { InYourLifeChip } from "@/features/items/InYourLifeChip";
import { deriveUsage } from "@/lib/derive-usage";
import { itemDisplayName, itemSubtitle } from "@/lib/items";
```

After the item lookup:

```tsx
  const [photos, curatorEvents, curatorSessions] = await Promise.all([
    PhotoController.fromDb(db).findByItem(item.id),
    // Server-only: only the folded answer for this one item reaches the client.
    DecisionController.fromDb(db).listForCurator(collection.id, session.user.id),
    SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id),
  ]);
  const usage = deriveUsage(curatorEvents, new Set([item.id])).get(item.id);
  const openSession = curatorSessions.find((s) => s.status === "active" || s.status === "paused");
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;
  // findByItem has no ORDER BY: cover first, then upload order (spec §6).
  const orderedPhotos = [...photos]
    .sort((a, b) => Number(b.isHero) - Number(a.isHero) || +new Date(a.createdAt) - +new Date(b.createdAt) || (a.id < b.id ? -1 : 1))
    .map((p) => ({
      id: p.id, itemId: item.id, collectionId: collection.id, rotation: p.rotation,
      updatedAt: p.updatedAt, alt: itemDisplayName(item), isHero: p.isHero,
    }));
  return (
    <AppLayout breadcrumbs={trail.item(collection, item)}>
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl text-ink sm:text-4xl">{itemDisplayName(item)}</h1>
            <p className="mt-1 text-sm text-ink-soft">{itemSubtitle(item, new Date())}</p>
          </div>
        </header>
        <div className="grid gap-6 md:grid-cols-[3fr_2fr] md:items-start">
          <ItemPhotoCarousel photos={orderedPhotos} collectionId={collection.id} itemName={itemDisplayName(item)}
            addPhotosHref={`${collectionHref}/items/${item.number}/photos`} canDelete />
          <Card variant="glass" padding="lg" className="space-y-6">
            <InYourLifeChip collectionId={collection.id} itemId={item.id} sessionId={openSession?.id ?? null} initial={usage} />
            <ItemPanelForm item={item} collectionId={collection.id} />
          </Card>
        </div>
      </div>
    </AppLayout>
  );
```

Delete `src/features/items/ItemMetadata.tsx` and `ItemMetadata.test.tsx`.

- [ ] **Step 4:** `npx vitest run src/features/items src/lib/items.test.ts` → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5:** `git add -A src/features/items src/lib/items.ts src/lib/items.test.ts "src/app/collections/[id]/items/[itemNumber]/page.tsx" && git commit -m "feat(items): item panel fields, leave guard and in-your-life chip"`

## Task 5: Carousel swipe, thumbnail strip with ··· (Make cover / Delete), Add photos

**Files:** Modify `src/features/items/ItemPhotoCarousel.tsx:1-147` and its test; create
`src/features/items/PhotoThumbMenu.tsx`. Modify `src/features/pool/PoolUpload.tsx:10-12, 99-160,
200-206` and its test. Modify the item `page.tsx` carousel element. Delete `PhotoDeleteControl.tsx` + test.

**Interfaces:**
- `type CarouselPhoto = ViewerPhoto & { isHero: boolean }`;
  `ItemPhotoCarousel({ photos: CarouselPhoto[]; collectionId: string; itemId: string; itemName: string })`.
- `PhotoThumbMenu({ collectionId; itemId; photoId: string; position: number; isCover: boolean; onMadeCover(): void; onDeleted(): void })`
  — calls `POST …/photos/[photoId]/set-hero` and `DELETE …/photos/[photoId]` (existing).
- `PoolUpload({ collectionId: string; attachToItemId?: string })`; exported
  `attachToItem(collectionId, itemId, pathnames: string[]): Promise<number>` — consumes
  `GET /api/collections/[id]/pool/photos` (`{ photos: {id, filename}[] }`) and `POST …/photos/reassign`.

- [ ] **Step 1: Failing tests.** In `ItemPhotoCarousel.test.tsx`: change `mk` to add `isHero: i === 0`,
  `props` to `{ collectionId: "c1", itemId: "i1", itemName: "Bag" }`, `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))`
  stays, add `vi.mock("@/features/pool/PoolUpload", () => ({ PoolUpload: ({ attachToItemId }: { attachToItemId?: string }) => <p>uploader for {attachToItemId}</p> }))`.
  Delete the tests "shows an affirming add-photos CTA…", "hides the delete control…", and the three
  delete tests; add:

```tsx
  it("swipes: a leftward touch moves to the next photo, a rightward one back", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const stage = screen.getByTestId("carousel-stage");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    expectCurrentPhoto("p2");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200 }] });
    expectCurrentPhoto("p1");
  });
  it("a thumbnail jumps to its photo", async () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Show photo 3" }));
    expectCurrentPhoto("p3");
  });
  it("Make cover calls set-hero and moves that photo first", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    expect(screen.queryAllByRole("button", { name: "Make cover" })).toHaveLength(0); // menus closed
    await userEvent.click(screen.getByRole("button", { name: "More for photo 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Make cover" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/items/i1/photos/p2/set-hero", { method: "POST" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Show photo 1 (cover)" })).toBeInTheDocument());
    expectCurrentPhoto("p2");
  });
  it("the cover's menu offers no Make cover; Delete needs one sober confirm", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "More for photo 1" }));
    expect(screen.queryByRole("button", { name: "Make cover" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/can.t be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^show photo/i })).toHaveLength(1));
    expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/items/i1/photos/p1", { method: "DELETE" });
  });
  it("+ Add photos opens the pool uploader attached to this item, even with no photos", async () => {
    render(<ItemPhotoCarousel photos={[]} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Add photos" }));
    expect(screen.getByText("uploader for i1")).toBeInTheDocument();
  });
```

In `PoolUpload.test.tsx` add (mirrors the multi-file test's fake-timer pattern):

```tsx
  it("attached to an item: moves exactly the rows it uploaded onto the item", async () => {
    upload.mockResolvedValueOnce({ url: "u", pathname: "a-x1.png" } as never);
    const fetch = vi.fn()
      .mockResolvedValueOnce(countResponse(1)) // baseline (someone else's pooled photo)
      .mockResolvedValueOnce(countResponse(2)) // poll: our row landed
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [
        { id: "ph_other", filename: "other.png" }, { id: "ph_ours", filename: "a-x1.png" },
      ] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ number: 4 }) }); // reassign
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" attachToItemId="item_4" />);
      fireEvent.change(fileInput(container), { target: { files: [png("a.png")] } });
      await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
      const reassign = fetch.mock.calls.find(([url]) => url === "/api/collections/coll_9/photos/reassign")!;
      expect(JSON.parse(reassign[1].body)).toEqual({ photoIds: ["ph_ours"], destination: { type: "item", itemId: "item_4" } });
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2:** `npx vitest run src/features/items/ItemPhotoCarousel.test.tsx src/features/pool/PoolUpload.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** `src/features/items/PhotoThumbMenu.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
const ITEM = "flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-ink hover:bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary";
interface Props {
  collectionId: string; itemId: string; photoId: string; position: number; isCover: boolean;
  onMadeCover: () => void; onDeleted: () => void;
}
// Disclosure (not an ARIA menu): two actions, and Delete stays a hard delete behind one confirm.
export function PhotoThumbMenu({ collectionId, itemId, photoId, position, isCover, onMadeCover, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}`;
  async function run(init: RequestInit, url: string, done: () => void) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error("photo action failed");
      setOpen(false);
      setConfirming(false);
      done();
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="absolute right-0 top-0">
      <button type="button" aria-label={`More for photo ${position}`} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setConfirming(false); }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-glass-strong text-ink ring-1 ring-rim focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden>···</span>
      </button>
      {open && (
        <div role="group" aria-label={`Photo ${position} actions`}
          className="absolute right-0 top-12 z-30 w-60 space-y-1 rounded-card bg-surface-raised p-2 shadow-raised ring-1 ring-hairline">
          {!confirming ? (
            <>
              {!isCover && (
                <button type="button" className={ITEM} disabled={busy}
                  onClick={() => run({ method: "POST" }, `${base}/set-hero`, onMadeCover)}>Make cover</button>
              )}
              <button type="button" className={ITEM} onClick={() => setConfirming(true)}>Delete</button>
            </>
          ) : (
            <>
              <p className="px-2 text-sm text-ink">Delete this photo? This can&apos;t be undone.</p>
              <div className="flex gap-2 px-2">
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep</Button>
                <Button variant="danger" aria-label="Delete photo" disabled={busy}
                  onClick={() => run({ method: "DELETE" }, base, onDeleted)}>Delete</Button>
              </div>
            </>
          )}
          <p role="status" className="px-2 text-sm text-error-deep">{error}</p>
        </div>
      )}
    </div>
  );
}
```

`ItemPhotoCarousel.tsx`: props become `{ photos: CarouselPhoto[]; collectionId: string; itemId: string; itemName: string }`
(export `type CarouselPhoto = ViewerPhoto & { isHero: boolean }`); remove `Link`, the
`PhotoDeleteControl` import/overlay, `addPhotosHref`, `canDelete`; import `PhotoThumbMenu` and
`PoolUpload` from `@/features/pool/PoolUpload`, plus `useRef`. Add state/handlers:

```tsx
  const [adding, setAdding] = useState(false);
  const touchX = useRef<number | null>(null);
  const makeCover = (id: string) => {
    setPhotos((prev) => {
      const next = prev.map((p) => ({ ...p, isHero: p.id === id }));
      return [...next.filter((p) => p.id === id), ...next.filter((p) => p.id !== id)];
    });
    setIndex(0);
    router.refresh();
  };
  const strip = (
    <>
      <ul aria-label="All photos" className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <li key={p.id} className="relative shrink-0">
            <button type="button" onClick={() => go(i)} aria-current={i === current}
              aria-label={`Show photo ${i + 1}${p.isHero ? " (cover)" : ""}`}
              className={`block h-20 w-20 overflow-hidden rounded-control ring-2 ${i === current ? "ring-primary" : "ring-transparent"}`}>
              <Image src={getPhotoAssetUrl(collectionId, p.itemId, p.id, { w: 160, v: new Date(p.updatedAt).getTime() })}
                alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" />
            </button>
            <PhotoThumbMenu collectionId={collectionId} itemId={p.itemId} photoId={p.id} position={i + 1}
              isCover={p.isHero} onMadeCover={() => makeCover(p.id)} onDeleted={() => handleDeleted(p.id)} />
          </li>
        ))}
        <li className="shrink-0">
          <button type="button" aria-expanded={adding} aria-controls="add-photos-panel" onClick={() => setAdding((a) => !a)}
            className="flex h-20 w-20 flex-col items-center justify-center rounded-control border-2 border-dashed border-hairline text-sm text-ink">
            <span aria-hidden className="text-xl">+</span>Add photos
          </button>
        </li>
      </ul>
      {adding && <div id="add-photos-panel" className="mt-3"><PoolUpload collectionId={collectionId} attachToItemId={itemId} /></div>}
    </>
  );
```

The empty branch returns `<div><div className="flex aspect-4/3 items-center justify-center rounded-card bg-card p-6 text-center ring-1 ring-hairline"><p className="text-ink-soft">Add photos whenever you like — they help you see what you love.</p></div>{strip}</div>`.
In the populated branch, give the stage `<div data-testid="carousel-stage" …>` the touch handlers and render `{strip}`
after the dots:

```tsx
        onTouchStart={(e) => { touchX.current = e.changedTouches[0].clientX; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start === null) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) >= 40) go(dx < 0 ? current + 1 : current - 1);
        }}
```

Update the doc comment: "Navigate with arrows, dots, thumbnails, ArrowLeft/Right, or a native swipe."

`PoolUpload.tsx`: add `attachToItemId?: string` to props and above the component:

```tsx
// Item mode (the panel's "+ Add photos"): uploads go through the pool exactly as usual,
// then the rows we just created — matched by blob pathname, which the Blob callback stores
// as `filename` — move onto the item via the existing reassign route.
export async function attachToItem(collectionId: string, itemId: string, pathnames: string[]): Promise<number> {
  const res = await fetch(`/api/collections/${collectionId}/pool/photos`, { cache: "no-store" });
  if (!res.ok) return 0;
  const { photos = [] } = (await res.json()) as { photos?: { id: string; filename: string }[] };
  const wanted = new Set(pathnames);
  const ids = photos.filter((p) => wanted.has(p.filename)).map((p) => p.id);
  let moved = 0;
  for (let i = 0; i < ids.length; i += MAX_GROUP_PHOTOS) {
    const photoIds = ids.slice(i, i + MAX_GROUP_PHOTOS);
    const r = await fetch(`/api/collections/${collectionId}/photos/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoIds, destination: { type: "item", itemId } }),
    });
    if (r.ok) moved += photoIds.length;
  }
  return moved;
}
```

(`import { MAX_GROUP_PHOTOS } from "@/lib/pool-limits";`.) In `uploadAll`: declare
`const uploaded: string[] = [];`, change the upload call to `const blob = await upload(…)` and push
`blob.pathname` after `succeeded += 1`. Replace the `if (succeeded > 0)` block with:

```tsx
    if (succeeded > 0) {
      await waitForPooledRows(collectionId, baseline, succeeded);
      if (attachToItemId) {
        const moved = await attachToItem(collectionId, attachToItemId, uploaded);
        setNote(moved < succeeded ? "A few photos are still arriving — they'll wait in your photo pool." : "");
      }
      router.refresh();
    }
```

with `const [note, setNote] = useState("");` rendered as `{note && <p className="text-sm text-ink-soft">{note}</p>}`
under the drop zone, and the helper line under "Select photos" shown only when `!attachToItemId`.

In the item `page.tsx`, replace the carousel element with
`<ItemPhotoCarousel key={orderedPhotos.map((p) => `${p.id}${p.isHero ? "*" : ""}`).join()} photos={orderedPhotos} collectionId={collection.id} itemId={item.id} itemName={itemDisplayName(item)} />`
(the key remounts the client copy after `router.refresh()` brings new photos). Delete
`src/features/items/PhotoDeleteControl.tsx` and `.test.tsx`.

- [ ] **Step 4:** `npx vitest run src/features/items src/features/pool` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** `git add -A src/features/items src/features/pool "src/app/collections/[id]/items/[itemNumber]/page.tsx" && git commit -m "feat(items): carousel swipe, thumbnail cover/delete, add photos to item"`

## Task 6: Overflow menu — Archive (soft delete + undo) and owner-only Delete (purge, 409)

**Files:** Create `src/features/items/ItemOverflowMenu.tsx` (+`.test.tsx`). Modify
`src/features/items/RemovedItemNotice.tsx:51-59` + test; item `page.tsx` header. Delete
`ItemDeleteControl.tsx` + test.

**Interfaces:** `ItemOverflowMenu({ itemId: string; itemsHref: string; rankingsHref: string; isOwner: boolean })`;
`IN_RANKING_LINE = "This one is part of a saved ranking."`. Consumes `DELETE /api/items/[id]`,
`POST /api/items/[id]/purge` with `{ confirm: "PURGE" }` (409 = in a ranking). Lands on
`${itemsHref}?removed=${itemId}`, where `RemovedItemNotice` offers Undo via `POST …/restore`.

- [ ] **Step 1: Failing test** `ItemOverflowMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { ItemOverflowMenu, IN_RANKING_LINE } from "./ItemOverflowMenu";
const props = { itemId: "i1", itemsHref: "/collections/bags/items", rankingsHref: "/collections/bags/results" };
beforeEach(() => vi.clearAllMocks());
describe("ItemOverflowMenu", () => {
  it("a curator can archive but sees no Delete; archive lands on the list with the undo notice", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    render(<ItemOverflowMenu {...props} isOwner={false} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/items/i1", { method: "DELETE" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/items?removed=i1"));
  });
  it("owner Delete confirms, purges, and on 409 explains the saved ranking without leaving", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409 }) as never;
    render(<ItemOverflowMenu {...props} isOwner />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/items/i1/purge");
    expect(JSON.parse(init.body)).toEqual({ confirm: "PURGE" });
    await waitFor(() => expect(screen.getByText(IN_RANKING_LINE, { exact: false })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "See your rankings" })).toHaveAttribute("href", props.rankingsHref);
    expect(push).not.toHaveBeenCalled();
  });
});
```

In `RemovedItemNotice.test.tsx` change `/removed/i` → `/archived/i` and `/bring it back/i` → `/^undo$/i` (both places).

- [ ] **Step 2:** `npx vitest run src/features/items/ItemOverflowMenu.test.tsx src/features/items/RemovedItemNotice.test.tsx` → FAIL.

- [ ] **Step 3: Implement** `ItemOverflowMenu.tsx`:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
export const IN_RANKING_LINE = "This one is part of a saved ranking.";
const ITEM = "flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-ink hover:bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary";
interface Props { itemId: string; itemsHref: string; rankingsHref: string; isOwner: boolean }
// Archive = the reversible soft delete (undo waits on the list). Delete = the owner-only
// permanent purge; the server answers 409 while any ranking holds the item.
export function ItemOverflowMenu({ itemId, itemsHref, rankingsHref, isOwner }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"" | "retry" | "in-ranking">("");
  async function send(url: string, init: RequestInit, onOk: () => void) {
    setBusy(true);
    setProblem("");
    const res = await fetch(url, init).catch(() => null);
    if (res?.ok) return onOk();
    setProblem(res?.status === 409 ? "in-ranking" : "retry");
    setBusy(false);
  }
  return (
    <div className="relative shrink-0">
      <button type="button" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-glass-strong text-ink ring-1 ring-rim focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden>···</span>
      </button>
      {open && (
        <div role="group" aria-label="Item actions"
          className="absolute right-0 z-30 mt-2 w-72 space-y-2 rounded-card bg-surface-raised p-3 shadow-raised ring-1 ring-hairline">
          {!confirming ? (
            <>
              <button type="button" className={ITEM} disabled={busy}
                onClick={() => send(`/api/items/${itemId}`, { method: "DELETE" }, () => router.push(`${itemsHref}?removed=${itemId}`))}>
                Archive
              </button>
              <p className="px-3 text-sm text-ink-soft">It leaves your sort and can come back any time.</p>
              {isOwner && <button type="button" className={ITEM} onClick={() => setConfirming(true)}>Delete</button>}
            </>
          ) : (
            <>
              <p className="text-sm text-ink">Delete this item for good? Its photos go with it, and this can&apos;t be undone.</p>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep</Button>
                <Button variant="danger" disabled={busy}
                  onClick={() => send(`/api/items/${itemId}/purge`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "PURGE" }),
                  }, () => router.push(itemsHref))}>
                  {busy ? "Deleting…" : "Delete for good"}
                </Button>
              </div>
            </>
          )}
          <div role="status" className="text-sm">
            {problem === "retry" && <span className="text-error-deep">That didn&apos;t go through — try again.</span>}
            {problem === "in-ranking" && (
              <span className="text-ink">
                {IN_RANKING_LINE} <Link href={rankingsHref} className="text-ink underline">See your rankings</Link>, or archive it instead.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

`RemovedItemNotice.tsx`: text → `Archived. You'll find it under Archived if you want it back.`; the
`AsyncActionButton` gets `label="Undo"`, `busyLabel="Bringing it back…"`; update the header comment
("the panel's Archive lands here").

Item `page.tsx`: import `ItemOverflowMenu`; inside `<header>` after the title `div` add
`<ItemOverflowMenu itemId={item.id} itemsHref={`${collectionHref}/items`} rankingsHref={`${collectionHref}/results`} isOwner={collection.ownerId === session.user.id} />`.
Delete `ItemDeleteControl.tsx` and `.test.tsx`.

- [ ] **Step 4:** `npx vitest run src/features/items` → PASS.
- [ ] **Step 5:** `git add -A src/features/items "src/app/collections/[id]/items/[itemNumber]/page.tsx" && git commit -m "feat(items): overflow archive with undo and owner delete"`

## Task 7: Items list — card grid, search, pills (Archived replaces Deleted)

**Files:** Modify `src/server/repositories/implementations/ItemRepository.ts:1, after 112`,
`src/server/api/items.ts` (add `listArchived`), `src/lib/items.ts:25-59` + `src/lib/items.test.ts`,
`src/app/collections/[id]/items/page.tsx:1-131` + `page.test.tsx`. Create
`src/features/items/{ItemFilterPills.tsx,ItemFilterPills.test.tsx,ArchivedItemCard.tsx,BringBackButton.tsx}`,
`src/lib/db/item-archive.integration.test.ts`. Delete `ItemFilters.tsx` + test.

**Interfaces:** `ItemRepository.findArchivedByCollection(collectionId): Promise<Item[]>` (newest
archived first); `ItemController.listArchived(collectionId)`; `type ItemsView = "all" | "archived" | "unnamed"`;
`itemsViewHref(base: string, view: ItemsView, q: string): string`; `filterItems(items, { unnamed: boolean; q: string })`;
`itemsEmptyState({ hasAnyItems: boolean; view: ItemsView; q: string })`. URL contract: `?status=archived`,
`?unnamed=1`, `?q=` (≤100 chars).

- [ ] **Step 1: Failing tests.** `src/lib/db/item-archive.integration.test.ts` (the §7 DB row):

```ts
// @vitest-environment node
// Archive = soft delete. One real-DB crossing: the live read (sort, live ranking, All)
// drops the item, the Archived read returns it, a saved ranking keeps its row, restore undoes it.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedSortScenario } from "../../../e2e/fixtures/seed";
import { sortResultItemsTable } from "@/lib/db/schema";
import { ItemController } from "@/server/api/items";
import { ItemSoftDeleteService } from "@/server/services/ItemService";
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
describeDb("archive (soft delete) across the live and archived reads", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });
  it("hides from the live list, appears under Archived, keeps saved-ranking rows, and restores", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const { collectionId, itemIds } = await seedSortScenario(ownerId);
    const items = ItemController.fromDb(db);
    const target = (await items.listItems(collectionId)).find((i) => i.id === itemIds[0])!;
    const rankingRows = () => db.select().from(sortResultItemsTable).where(eq(sortResultItemsTable.itemId, target.id));
    const before = (await rankingRows()).length;
    expect(before).toBeGreaterThan(0);
    expect(await items.listArchived(collectionId)).toEqual([]);
    await ItemSoftDeleteService.fromDb(db).softDeleteWithAudit(target, ownerId);
    expect((await items.listItems(collectionId)).map((i) => i.id)).not.toContain(target.id);
    expect((await items.listArchived(collectionId)).map((i) => i.id)).toEqual([target.id]);
    expect((await rankingRows()).length).toBe(before);
    await items.restoreItem(target.id);
    expect((await items.listItems(collectionId)).map((i) => i.id)).toContain(target.id);
    expect(await items.listArchived(collectionId)).toEqual([]);
  });
});
```

In `src/lib/items.test.ts` replace the `filterItems` and `itemsEmptyState` describes with:

```ts
describe("filterItems", () => {
  const items = [mk({ name: "Weekend tote", brand: "Coach" }), mk({ name: null, color: "Tan" }), mk({ name: "Clutch (red)" })];
  it("matches q case-insensitively across name, brand and the other text fields", () => {
    expect(filterItems(items, { unnamed: false, q: "coach" }).map((i) => i.name)).toEqual(["Weekend tote"]);
    expect(filterItems(items, { unnamed: false, q: "TAN" })).toHaveLength(1);
  });
  it("treats q as plain text, never a pattern", () => {
    expect(filterItems(items, { unnamed: false, q: "(red" }).map((i) => i.name)).toEqual(["Clutch (red)"]);
    expect(filterItems(items, { unnamed: false, q: ".*" })).toEqual([]);
  });
  it("Waiting for a name keeps only nameless items (whitespace counts as nameless)", () => {
    expect(filterItems([...items, mk({ name: "  " })], { unnamed: true, q: "" })).toHaveLength(2);
  });
});
describe("itemsEmptyState", () => {
  it("speaks gently per view, never counting what's missing", () => {
    expect(itemsEmptyState({ hasAnyItems: false, view: "all", q: "" }).heading).toBe("No items yet");
    expect(itemsEmptyState({ hasAnyItems: true, view: "archived", q: "" }).heading).toBe("Nothing archived");
    expect(itemsEmptyState({ hasAnyItems: true, view: "all", q: "silk" }).heading).toBe("Nothing matches “silk”");
  });
});
```

(`mk` already exists in that file; add `color` to its overrides type if missing.)

`src/features/items/ItemFilterPills.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilterPills } from "./ItemFilterPills";
describe("ItemFilterPills", () => {
  it("marks the selected pill with aria-current and a check glyph, not colour alone; links keep q", () => {
    render(<ItemFilterPills base="/collections/bags" view="archived" q="tote" />);
    const archived = screen.getByRole("link", { name: "Archived" });
    expect(archived).toHaveAttribute("aria-current", "page");
    expect(archived.querySelector("svg")).not.toBeNull();
    const all = screen.getByRole("link", { name: "All" });
    expect(all).not.toHaveAttribute("aria-current");
    expect(all.querySelector("svg")).toBeNull();
    expect(all).toHaveAttribute("href", "/collections/bags/items?q=tote");
    expect(screen.getByRole("link", { name: "Waiting for a name" })).toHaveAttribute("href", "/collections/bags/items?unnamed=1&q=tote");
  });
});
```

Rewrite `src/app/collections/[id]/items/page.test.tsx`: hoisted mocks add
`itemController.listArchived`, `preferenceController: { listItemPreferences: vi.fn() }` with
`vi.mock("@/server/api/preferences", () => ({ PreferenceController: { fromDb: () => preferenceController } }))`,
and `next/navigation` mock becomes `{ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }`.
`renderPage(searchParams?: { status?: string; unnamed?: string; q?: string })`. Keep `makeItem`; in
`beforeEach` set `listItems → [NAMED, UNNAMED]`, `listArchived → [ARCHIVED]`,
`listItemPreferences → [{ itemId: "item_1", rankBucket: "top" }]`. Tests:

```tsx
it("All: live items as cards linking to the panel, with a tier chip once sorted", async () => {
  await renderPage();
  expect(screen.getByRole("link", { name: "Tote" })).toHaveAttribute("href", "/collections/summer-bags/items/1");
  expect(screen.getByTitle("Love")).toBeInTheDocument();
  expect(screen.queryByText("Old clutch")).not.toBeInTheDocument();
});
it("Archived: lists soft-deleted items with Bring back and no panel link", async () => {
  await renderPage({ status: "archived" });
  expect(screen.getByText("Old clutch")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bring back" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
});
it("search narrows the grid and keeps the query in the field", async () => {
  await renderPage({ q: "tote" });
  expect(screen.getByRole("link", { name: "Tote" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "#2" })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("tote");
});
```

- [ ] **Step 2:** `npx vitest run src/lib/items.test.ts src/features/items/ItemFilterPills.test.tsx "src/app/collections/[id]/items/page.test.tsx"` → FAIL;
  `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/item-archive.integration.test.ts` → FAIL (`listArchived` is not a function).

- [ ] **Step 3: Implement.** `ItemRepository.ts`: import line becomes
  `import { eq, isNull, isNotNull, and, sql, asc, desc } from "drizzle-orm";`; add after `findByCollection`:

```ts
  // Soft-deleted ("archived") items of a collection, most recently archived first.
  async findArchivedByCollection(collectionId: string): Promise<Item[]> {
    const rows = await this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.collectionId, collectionId), isNotNull(itemsTable.deletedAt)))
      .orderBy(desc(itemsTable.deletedAt), asc(itemsTable.id));
    return rows.map((r) => this.mapToItem(r));
  }
```

`items.ts`: `async listArchived(collectionId: string): Promise<Item[]> { return this.itemRepo.findArchivedByCollection(collectionId); }`

`src/lib/items.ts` — replace `filterItems` and `itemsEmptyState`:

```ts
const SEARCHABLE = ["name", "brand", "style", "color", "material", "category"] as const;
/** Grid filter: plain-text search (never a pattern) and the "Waiting for a name" view. */
export function filterItems(items: Item[], opts: { unnamed: boolean; q: string }): Item[] {
  const needle = opts.q.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (opts.unnamed && hasName(item)) return false;
    if (!needle) return true;
    return SEARCHABLE.some((k) => item[k]?.toLocaleLowerCase().includes(needle)) ||
      (item.number != null && `#${item.number}` === needle);
  });
}
export function itemsEmptyState(opts: { hasAnyItems: boolean; view: "all" | "archived" | "unnamed"; q: string }) {
  if (opts.q.trim()) return { heading: `Nothing matches “${opts.q.trim()}”`, message: "Try another word, or clear the search." };
  if (opts.view === "archived") return { heading: "Nothing archived", message: "Archived items rest here, ready to come back whenever you like." };
  if (opts.view === "unnamed") return { heading: "Everything has a name", message: "Nothing is waiting — name things whenever you like." };
  if (!opts.hasAnyItems) return { heading: "No items yet", message: "Add photos to start your collection." };
  return { heading: "No items here", message: "Try a different filter." };
}
```

`src/features/items/ItemFilterPills.tsx`:

```tsx
import Link from "next/link";
export type ItemsView = "all" | "archived" | "unnamed";
const PILLS: [ItemsView, string][] = [["all", "All"], ["archived", "Archived"], ["unnamed", "Waiting for a name"]];
export function itemsViewHref(base: string, view: ItemsView, q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (view === "unnamed") p.set("unnamed", "1");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `${base}/items${qs ? `?${qs}` : ""}`;
}
export function ItemFilterPills({ base, view, q }: { base: string; view: ItemsView; q: string }) {
  return (
    <nav aria-label="Filter items">
      <ul className="flex flex-wrap gap-2">
        {PILLS.map(([v, label]) => {
          const on = v === view;
          return (
            <li key={v}>
              <Link href={itemsViewHref(base, v, q)} aria-current={on ? "page" : undefined}
                className={`inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm no-underline ${on ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline bg-glass text-ink"}`}>
                {on && (
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`src/features/items/BringBackButton.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";
export function BringBackButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  return (
    <AsyncActionButton label="Bring back" busyLabel="Bringing it back…" action={async () => {
      const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("restore failed");
      router.refresh();
    }} />
  );
}
```

`src/features/items/ArchivedItemCard.tsx`:

```tsx
import type { Item } from "@/types";
import { Card, CardImage } from "@/components/ui";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { BringBackButton } from "./BringBackButton";
// An archived item has no panel (its route resolves live items only), so the card
// offers the way back instead of a link.
export function ArchivedItemCard({ item, coverUrl }: { item: Item; coverUrl?: string }) {
  return (
    <Card padding="none" className="flex h-full flex-col overflow-hidden">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-content-soft">
        <CardImage src={coverUrl} alt={itemDisplayName(item)}
          fallback={<span aria-hidden className="font-display text-5xl text-ink-soft">{itemInitial(item)}</span>} />
      </div>
      <div className="space-y-2 p-3">
        <h3 className="truncate text-ink">{itemDisplayName(item)}</h3>
        <BringBackButton itemId={item.id} />
      </div>
    </Card>
  );
}
```

Items `page.tsx`: `searchParams` type gains `q?: string`. Replace lines 36-49 with:

```tsx
  const view: ItemsView = searchParams?.status === "archived" ? "archived" : searchParams?.unnamed === "1" ? "unnamed" : "all";
  const q = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : "";
  const controller = ItemController.fromDb(db);
  const [items, preferences] = await Promise.all([
    view === "archived" ? controller.listArchived(collection.id) : controller.listItems(collection.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
  ]);
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds(items.map((i) => i.id));
  const tierByItem = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));
  const visible = filterItems(items, { unnamed: view === "unnamed", q });
  const empty = itemsEmptyState({ hasAnyItems: items.length > 0, view, q });
  const coverUrl = (id: string) => {
    const c = covers.get(id);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
```

Replace `<ItemFilters …/>` with the search form plus pills:

```tsx
        <form role="search" action={`${collectionHref}/items`} className="flex items-end gap-2">
          {view === "archived" && <input type="hidden" name="status" value="archived" />}
          {view === "unnamed" && <input type="hidden" name="unnamed" value="1" />}
          <Input type="search" name="q" defaultValue={q} label="Search your items" placeholder="Name, brand, colour…" maxLength={100} />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <ItemFilterPills base={collectionHref} view={view} q={q} />
```

and the grid (2 columns phone, 3 to 4 tablet) with `visible.map`:

```tsx
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) =>
              view === "archived" ? (
                <ArchivedItemCard key={item.id} item={item} coverUrl={coverUrl(item.id)} />
              ) : (
                <ItemCard key={item.id} item={item} collectionId={collection.slug ?? collection.id}
                  heroPhotoUrl={coverUrl(item.id)} bucket={tierByItem.get(item.id)} />
              ),
            )}
          </div>
```

The `EmptyState` uses `visible.length === 0` and `action` only when `!items.length && view === "all"`
(`{ label: "Add photos", href: `${collectionHref}/pool` }`). Imports: drop `ItemFilters`; add
`Input`, `PreferenceController` (`@/server/api/preferences`), `ItemFilterPills`/`ItemsView`,
`ArchivedItemCard`. Delete `src/features/items/ItemFilters.tsx` + `.test.tsx`.

- [ ] **Step 4:** unit command from Step 2 → PASS; DB command → PASS.
- [ ] **Step 5:** `git add -A src/server src/lib/items.ts src/lib/items.test.ts src/lib/db/item-archive.integration.test.ts src/features/items "src/app/collections/[id]/items/page.tsx" "src/app/collections/[id]/items/page.test.tsx" && git commit -m "feat(items): card grid with search and pills; Archived lists soft-deleted items"`

## Task 8: `…/edit` and `…/photos` redirect to the panel after the guard

**Files:** Replace `src/app/collections/[id]/items/[itemNumber]/edit/page.tsx:1-45` and
`photos/page.tsx:1-74`. Modify `src/lib/db/page-authz-enumeration.integration.test.ts:49-58` (mock),
`:127-128` (comments), add a test after the stranger test. Modify
`src/components/layout/breadcrumb-trails.ts:31-48, 80-87` and its test (`:20-21, 49-53, 84-87`).
Delete `ItemEditForm.tsx`, `PhotoUpload.tsx` and their tests.

**Interfaces:** Both pages: `default async ({ params: Promise<{ id: string; itemNumber: string }> })` →
`permanentRedirect` to `/collections/{slug}/items/{n}` when `itemNumber` is all digits, else to
`/collections/{slug}/items`.

- [ ] **Step 1: Failing test.** In the enumeration test, extend the hoisted mocks and the
  `next/navigation` mock:

```ts
  mockPermanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`);
  }),
```

`vi.mock("next/navigation", () => ({ redirect: mockRedirect, permanentRedirect: mockPermanentRedirect, notFound: … }))`.
Store `ownerId` in a `let` beside `collectionId` in `beforeAll`. Add:

```ts
    it("edit/photos redirect a member to the panel; a non-numeric number goes to the list", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const items = `/collections/slug-${collectionId}/items`;
      const outcome = async (page: "edit" | "photos", itemNumber: string) => {
        const mod = (await import(/* @vite-ignore */ `@/app/collections/[id]/items/[itemNumber]/${page}/page`)) as {
          default: (p: { params: Promise<Record<string, string>> }) => Promise<unknown>;
        };
        return mod.default({ params: Promise.resolve({ id: collectionId, itemNumber }) }).catch((e: Error) => e.message);
      };
      try {
        expect(await outcome("edit", "1")).toBe(`NEXT_PERMANENT_REDIRECT:${items}/1`);
        expect(await outcome("photos", "1")).toBe(`NEXT_PERMANENT_REDIRECT:${items}/1`);
        expect(await outcome("edit", "../x")).toBe(`NEXT_PERMANENT_REDIRECT:${items}`);
        expect(await outcome("photos", "1?x")).toBe(`NEXT_PERMANENT_REDIRECT:${items}`);
      } finally {
        mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      }
    });
```

(Hoist `strangerId` to a `let` as well.) Update the comment above the two `p("…/edit"…)`/`p("…/photos"…)`
cases: "Retired pages: guard first, then permanentRedirect to the panel (spec §3) — the stranger must
still be bounced by the guard."

- [ ] **Step 2:** `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/page-authz-enumeration.integration.test.ts`
  → FAIL (the pages render forms instead of redirecting).

- [ ] **Step 3: Implement.** `edit/page.tsx` (and `photos/page.tsx` identically, component name `ItemPhotosRedirect`, comment naming the photos page):

```tsx
import { getSession } from "@/lib/auth";
import { redirect, permanentRedirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
interface Props {
  params: Promise<{ id: string; itemNumber: string }>;
}
// The item panel replaced the edit page (spec 2026-10-01 §3). Kept only to bounce old
// links. The guard runs FIRST (page-authz-enumeration exact-matches the stranger's
// redirect); the number is used only when it is all digits, never interpolated raw.
export default async function ItemEditRedirect({ params }: Props) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  const items = `/collections/${collection.slug ?? collection.id}/items`;
  permanentRedirect(/^\d+$/.test(itemNumber) ? `${items}/${itemNumber}` : items);
}
```

`breadcrumb-trails.ts`: delete `itemEdit`, `itemPhotos` and the now-unused `itemPrefix`, and the
sentence in the header comment pointing to `itemPrefix` (the documented null-number exception now
lives nowhere; `item` has no link). In its test delete the `itemEdit`/`itemPhotos` map rows and the
two `itemEdit` expectations (lines 49-53, 84-87; the `trail.item` label assertion stays). Delete
`src/features/items/ItemEditForm.tsx`, `ItemEditForm.test.tsx`, `PhotoUpload.tsx`, `PhotoUpload.test.tsx`.

- [ ] **Step 4:** DB command → PASS; `npx vitest run src/components/layout` → PASS; `npm run lint`.
- [ ] **Step 5:** `git add -A "src/app/collections/[id]/items/[itemNumber]" src/lib/db/page-authz-enumeration.integration.test.ts src/components/layout src/features/items && git commit -m "feat(items): retire edit and photos pages behind guarded redirects"`

## Task 9: Panel journey e2e, a11y screens, ci.yml map + map check

**Files:** Create `e2e/item-panel.spec.ts`, `scripts/ci-e2e-map.test.ts`. Modify `e2e/a11y.spec.ts:117-123`,
`.github/workflows/ci.yml:358-365, 437-457`. Delete `e2e/{item-page,delete-photo,image-rotate,delete-item}.spec.ts`.

**Interfaces:** Consumes the panel's accessible names from Tasks 4-7 (`Show photo N`, `More for photo N`,
`Make cover`, `Delete photo`, `Add photos`, `More actions`, `Archive`, `Bring back`, labels `Name`, `Brand`,
`Height (cm)`, `cm · kg`) and `seedBaseline`/`seedTriageScenario` (1 unnamed item #1, hero photo, active session).

- [ ] **Step 1: Failing map check** `scripts/ci-e2e-map.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
// CI runs e2e selectively from an area -> spec map in ci.yml ("Select e2e specs").
// A spec missing from the map silently never runs on a selective PR; a listed spec
// that no longer exists makes Playwright fail. Both halves are checked here.
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const start = ci.indexOf("- name: Select e2e specs");
const block = ci.slice(start, ci.indexOf("- name: Run e2e", start));
const listed = new Set(block.match(/e2e\/[\w-]+\.spec\.ts/g) ?? []);
const onDisk = readdirSync(new URL("../e2e/", import.meta.url))
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => `e2e/${f}`);
describe("ci.yml e2e area map", () => {
  it("finds the selection step", () => {
    expect(start).toBeGreaterThan(-1);
    expect(listed.size).toBeGreaterThan(3);
  });
  it("lists every e2e spec on disk in the floor or an area", () => {
    expect(onDisk.filter((s) => !listed.has(s))).toEqual([]);
  });
  it("lists only specs that exist", () => {
    expect([...listed].filter((s) => !onDisk.includes(s))).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx vitest run scripts/ci-e2e-map.test.ts` → FAIL: on-disk specs missing from the
  map today: `e2e/decision-recovery.spec.ts`, `e2e/delete-item.spec.ts`.

- [ ] **Step 3: Panel journey** `e2e/item-panel.spec.ts`:

```ts
// The one item surface (spec 2026-10-01 §3), un-mocked except photo bytes (no blob emulator).
// Replaces item-page, delete-photo, image-rotate and delete-item. The upload pipeline itself
// (Blob callback → pool → reassign) is unit-tested in PoolUpload.test.tsx; here we prove the
// tile reaches a multi-file chooser.
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { itemsTable } from "@/lib/db/schema";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
test.describe("item panel journey", () => {
  let slug: string;
  let secondPhotoId: string;
  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    const scenario = await seedTriageScenario(ownerId);
    slug = scenario.slug;
    const { db } = getTestDb();
    const [item] = await db.select().from(itemsTable).where(eq(itemsTable.collectionId, scenario.collectionId));
    const second = await new PhotoRepository(db).create({
      itemId: item.id, collectionId: scenario.collectionId, blobKey: "e2e-second", filename: "e2e-second.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
    secondPhotoId = second.id;
  });
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/item-page.webp", contentType: "image/webp" }),
    );
  });
  test("view, rotate, cover, delete a photo, edit, choose, archive, bring back", async ({ page }) => {
    test.setTimeout(90_000);
    const panel = `/collections/${slug}/items/1`;
    await page.goto(panel);
    await expect(page).toHaveURL((u) => u.pathname === panel);
    const stage = page.getByRole("group", { name: /photos of/i });
    const photo = stage.getByRole("img");
    const firstSrc = await photo.getAttribute("src");
    await page.getByRole("button", { name: /next photo/i }).click();
    await expect(photo).not.toHaveAttribute("src", firstSrc ?? "");
    await page.getByRole("button", { name: /view photo/i }).click();
    const dialog = page.getByRole("dialog");
    const patch = page.waitForRequest((r) => r.method() === "PATCH" && /\/photos\/[^/]+$/.test(r.url()));
    await dialog.getByRole("button", { name: /rotate photo/i }).click();
    expect((await patch).postDataJSON()).toEqual({ rotation: 90 });
    await expect(dialog.getByRole("status")).toHaveText(/rotated to 90 degrees/i);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "More for photo 2" }).click();
    await page.getByRole("button", { name: "Make cover" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Show photo 1 (cover)" })).toBeVisible();
    await expect(photo).toHaveAttribute("src", new RegExp(secondPhotoId));
    await page.getByRole("button", { name: "More for photo 2" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete photo" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /^show photo/i })).toHaveCount(1);
    await page.getByRole("button", { name: "Add photos" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Select photos" }).click();
    expect((await chooser).isMultiple()).toBe(true);
    await page.getByLabel("Name", { exact: true }).fill("Weekend tote");
    await page.getByLabel("Brand").fill("Coach");
    await page.getByText("Size", { exact: true }).click();
    await page.getByLabel("cm · kg").check();
    await page.getByLabel("Height (cm)").fill("30");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Brand")).toHaveValue("Coach");
    await expect(page.getByLabel("cm · kg")).toBeChecked();
    await expect(page.getByLabel("Height (cm)")).toHaveValue("30");
    await page.getByLabel("Name", { exact: true }).fill("");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Weekend tote");
    await expect(page.getByText("Give it a name to save")).toBeVisible();
    await page.getByRole("button", { name: "I use this" }).click();
    await expect(page.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: "Archive" }).click();
    await page.waitForURL((u) => u.pathname === `/collections/${slug}/items` && u.searchParams.has("removed"));
    await expect(page.getByText(/^Archived\./)).toBeVisible();
    await expect(page.getByRole("link", { name: "Weekend tote" })).toHaveCount(0);
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await page.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByRole("button", { name: "Bring back" })).toHaveCount(0);
    await page.getByRole("link", { name: "All", exact: true }).click();
    await expect(page.getByRole("link", { name: "Weekend tote" })).toBeVisible();
  });
});
```

Delete `e2e/item-page.spec.ts`, `e2e/delete-photo.spec.ts`, `e2e/image-rotate.spec.ts`,
`e2e/delete-item.spec.ts` (covered: carousel flip + viewer → steps 1-2; delete photo + server
reload → step 4; rotate PATCH + status → step 2; zoom scale is `ImageViewer.test.tsx`'s; remove +
undo → archive + bring back).

- [ ] **Step 4: a11y + ci.yml.** In `a11y.spec.ts` after `await page.goto(url, …)` add
  `await expect(page, `${name} landed`).toHaveURL((u) => u.pathname === url.split("?")[0]);` and add
  the screen `["items-archived", `/collections/${slug}/items?status=archived`]` after `items`.
  In `ci.yml`: items filter (line ~358) add `- 'src/features/pool/**'`; the `A_SORT` list adds
  `e2e/decision-recovery.spec.ts`; the `A_ITEMS` line becomes
  `add "e2e/item-panel.spec.ts e2e/item-removal.spec.ts e2e/image-perf.spec.ts"`.

- [ ] **Step 5: Run.** `npx vitest run scripts/ci-e2e-map.test.ts` → PASS.
  `npx playwright test e2e/item-panel.spec.ts e2e/a11y.spec.ts --project=tablet` → PASS.
  Local gate (not CI): `PW_VIEWPORT=phone npx playwright test e2e/item-panel.spec.ts`.
- [ ] **Step 6:** `git add -A e2e scripts/ci-e2e-map.test.ts .github/workflows/ci.yml && git commit -m "test(e2e): item panel journey replaces four specs; CI map check"`

## Task 10: Docs sync, full gate, screenshots

**Files:** Modify `docs/API.md:245-246` (collection-item PATCH), `:342-343` (`/api/items/[id]`),
`docs/ARCHITECTURE.md` (append decision 41 after entry 40).

- [ ] **Step 1: API.md.** Replace the PATCH body sentence with: "**Body (strict — `UpdateItemSchema`):**
  `{ name?: string (trimmed, 1-200), brand?|style?|color?|material?|category?: string|null (≤200),
  notes?: string|null (≤5000), story?: string|null (≤2000), status?: string, height?|width?|depth?|weight?:
  number|null (0-100000, finite), unit?: "imperial"|"metric" }`. `null` or a blank string clears a
  field; an unknown key, a negative/non-finite/string measure, a whitespace-only name or an
  out-of-set unit is `400` with nothing written. Numbers are stored as Postgres `numeric` and read
  back as strings. The unit only relabels; stored numbers are never converted." Add the same pointer to
  `PATCH /api/items/[id]` ("same `UpdateItemSchema` contract").
- [ ] **Step 2: ARCHITECTURE decision 41** "One item panel; Frosted shelf tokens (UX redesign PR 1,
  2026-10-01)": *Decision:* the item page is the only item surface (fields + carousel + chip +
  overflow); `…/edit` and `…/photos` are guard-then-`permanentRedirect` pages; item PATCH is strict
  with nullable clears and size/weight/unit; Archived = soft-deleted rows via
  `findArchivedByCollection`; "+ Add photos" = pool upload then reassign by blob pathname; the
  usage chip lazily opens a session. Glass tokens carry hex composites gated by `contrast.test.ts`.
  *Rationale:* spec §1 (four screens to edit one object), §5 (AA by the surface's own opacity).
  *Status:* Shipped (PR 1); sort/ranking in PR 2.
- [ ] **Step 3: Full gate.** `npm run lint && npm run test:ci && npm run build && npm run test:db && npx playwright test e2e/item-panel.spec.ts e2e/a11y.spec.ts e2e/layout.spec.ts e2e/smoke.spec.ts --project=tablet`
  (Card/Button/Input touch `src/components/ui/**`, a broad path, so also run `npm run test:e2e` once
  before the PR). Record each command and its result in the PR body.
- [ ] **Step 4:** `/sync-docs`, `graphify update .`, then `git add docs graphify-out && git commit -m "docs: item panel API contract and decision 41"`.
- [ ] **Step 5: Screenshots** with the `pr-screenshots` skill (`docs/cookbook/add-images-to-pr.md`):
  item panel, items list (All + Archived) — light, dark, and phone (`PW_VIEWPORT=phone`).
