# PR1a — Profile + Display Name + Session-Carry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-06-23-ui-experience-design.md` §5.1.

**Goal:** Let a user set a display name and see it reflected everywhere immediately, with the name carried correctly through the NextAuth session — plus fix the two shared-primitive a11y gaps the new form depends on.

**Architecture:** A new `/profile` page hosts a small client form that PATCHes `/api/users/me` (already exists) and calls `useSession().update({ name })`. The NextAuth jwt/session callbacks are extended to seed and refresh `token.name`. Two shared primitives get a11y fixes (`Input` label association, `ErrorMessage` live region — actually `ErrorMessage` belongs to PR1b; PR1a only needs `Input`).

**Tech Stack:** Next.js App Router, NextAuth v4 (JWT strategy), Drizzle, Zod, Vitest + @testing-library (jsdom), Playwright e2e.

## Global Constraints

- **Tone (TONE.md, first-order):** the profile is identity, not settings density. Gentle, person-side copy. No shaming, no count.
- **Design (DESIGN.md):** real tokens only (ink/surface/primary/accent/hairline); Playfair display-only, Inter for UI, headings in `ink` never teal; ≥44px targets; 10px control / 16px card radius.
- **a11y (WCAG 2.1 AA, both themes):** label↔control association; `:focus-visible` (never `outline:none`); keyboard operable; status announced via live region.
- **Tests:** TDD — failing test first. YAGNI does NOT apply to tests. Un-mocked-seam/DB tests live under `src/lib/db/` guarded by `RUN_DB_TESTS=1`; component tests use `// @vitest-environment jsdom` per file; e2e under `e2e/**`. Coverage merged floor 82.
- **Git:** one logical change per commit; conventional messages; never commit to `main`.
- **graphify:** run `graphify query "<q>"` before reading/grepping source; `graphify update .` after code changes.

---

### Task 1: `Input` label association (purses-1qor)

**Files:**
- Modify: `src/components/ui/Input.tsx`
- Test: `src/components/ui/Input.test.tsx` (create if absent; else add cases)

**Interfaces:**
- Produces: `Input` whose visible `<label>` is programmatically associated with its `<input>` (accessible-name queryable via `getByLabelText`).

- [ ] **Step 1: Read the current primitive.** `graphify query "Input component label id props"` then read `src/components/ui/Input.tsx`. Note its prop shape (it already takes a `label` prop).

- [ ] **Step 2: Write the failing test** (`src/components/ui/Input.test.tsx`):

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("associates the visible label with the input (queryable by label text)", () => {
    render(<Input label="Display name" value="" onChange={() => {}} />);
    // Fails today: no htmlFor/id, so getByLabelText finds nothing.
    expect(screen.getByLabelText("Display name")).toBeInstanceOf(HTMLInputElement);
  });

  it("links an explicit id when provided", () => {
    render(<Input id="name" label="Name" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Name");
    expect(input.id).toBe("name");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL.** `npx vitest run src/components/ui/Input.test.tsx` → fails (`getByLabelText` finds no element).

- [ ] **Step 4: Implement.** In `Input.tsx`, generate an id with React `useId()` when none is passed; set it on the `<input id={...}>` and the `<label htmlFor={...}>`. Preserve all existing props/styles. (If an `id` prop is passed, prefer it.) Keep `:focus-visible` ring; never `outline:none` without a visible replacement.

- [ ] **Step 5: Run it — expect PASS.** `npx vitest run src/components/ui/Input.test.tsx`.

- [ ] **Step 6: Confirm no regression.** `npx vitest run src/components/ui` (other primitives/forms using `Input` still green).

- [ ] **Step 7: Commit.** `git add src/components/ui/Input.tsx src/components/ui/Input.test.tsx && git commit -m "a11y(input): associate label with control via id (purses-1qor)"`

---

### Task 2: Name-only update — trim, max, clear (purses-wew API)

**Files:**
- Modify: `src/server/api/users.ts` (`UpdateUserSchema`, `updateCurrentUser`)
- Test: `src/lib/db/user-profile.integration.test.ts` (create — under `src/lib/db/` so the `db-tests` CI job runs it)

**Interfaces:**
- Produces: `UserController.updateCurrentUser(userId, { name })` where `name`: trimmed, ≤80 chars; **empty-after-trim → stored as `null` (cleared), not a 400**; over-length → throws ZodError (route returns 400 via `errorResponse`); unknown keys (e.g. `email`) stripped/ignored.

- [ ] **Step 1: Read patterns.** `graphify query "src/lib/db integration test getTestDb reset seed user"`; read one existing example (e.g. `src/lib/db/collection-access.integration.test.ts`) to mirror the harness (test DB acquisition + reset). Read `src/server/api/users.ts`.

- [ ] **Step 2: Write the failing test** (`src/lib/db/user-profile.integration.test.ts`). Mirror the existing harness for DB setup/reset and user seeding; assert the four behaviors:

```ts
// Uses the same RUN_DB_TESTS harness as the other src/lib/db integration tests.
import { describe, it, expect, beforeEach } from "vitest";
import { UserController } from "@/server/api/users";
// ...import the project's test-db helper + a user-seeding helper as the sibling tests do...

describe("updateCurrentUser (name-only, trim/max/clear)", () => {
  // beforeEach: reset DB + insert a user with id "user_test" name "Old"
  it("trims and stores a display name", async () => {
    const u = await UserController.fromDb(db).updateCurrentUser("user_test", { name: "  Tessa  " });
    expect(u.name).toBe("Tessa");
  });
  it("clears the name when empty-after-trim (stores null, does not throw)", async () => {
    const u = await UserController.fromDb(db).updateCurrentUser("user_test", { name: "   " });
    expect(u.name).toBeNull();
  });
  it("rejects an over-length name", async () => {
    await expect(
      UserController.fromDb(db).updateCurrentUser("user_test", { name: "x".repeat(81) }),
    ).rejects.toThrow();
  });
  it("ignores an email field (name-only flow)", async () => {
    const u = await UserController.fromDb(db).updateCurrentUser("user_test", {
      name: "Tessa", email: "evil@example.com",
    } as unknown);
    expect(u.email).not.toBe("evil@example.com");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL.** `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/user-profile.integration.test.ts` (start the test DB first per the repo's `npm run test:db` flow). Expect failures (clear throws today; email is accepted today).

- [ ] **Step 4: Implement.** In `src/server/api/users.ts`:

```ts
const UpdateUserSchema = z.object({
  // name-only flow: trim, bound length, allow empty (= clear). Unknown keys stripped.
  name: z.string().trim().max(80).optional(),
});

async updateCurrentUser(userId: string, data: unknown): Promise<User> {
  const parsed = UpdateUserSchema.parse(data);
  const patch: { name?: string | null } = {};
  if (parsed.name !== undefined) patch.name = parsed.name === "" ? null : parsed.name;
  return this.userRepo.update(userId, patch);
}
```

Confirm `IUserRepository.update` accepts `name: string | null` (it writes a Drizzle partial; null clears the column). If its type is `Partial<User>` with `name?: string`, widen to `string | null`.

- [ ] **Step 5: Run it — expect PASS.** Same command as Step 3.

- [ ] **Step 6: Commit.** `git add src/server/api/users.ts src/lib/db/user-profile.integration.test.ts && git commit -m "feat(profile): name-only update with trim/max/clear (purses-wew)"`

---

### Task 3: NextAuth session-carry — seed + update `token.name` (purses-wew)

**Files:**
- Modify: `src/lib/auth.ts` (extract + extend `jwt`/`session` callbacks)
- Test: `src/lib/auth-callbacks.test.ts` (create — pure unit test, no DB import side-effects)

**Interfaces:**
- Produces: exported `jwtCallback(args)` and `sessionCallback(args)` wired into `authOptions.callbacks`. `jwtCallback` seeds `token.name` from the signing-in user and refreshes it on `trigger === "update"`; `sessionCallback` writes `session.user.id` and `session.user.name` from the token.

- [ ] **Step 1: Read.** `graphify query "auth.ts jwt session callbacks token name authOptions"`; read `src/lib/auth.ts` (note: it does `DrizzleAdapter(getDb())` at module load, so test the callbacks as standalone exports to avoid a DB side-effect on import).

- [ ] **Step 2: Write the failing test** (`src/lib/auth-callbacks.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { jwtCallback, sessionCallback } from "./auth-callbacks";

describe("jwtCallback", () => {
  it("seeds id and name from the user on sign-in", async () => {
    const t = await jwtCallback({ token: {}, user: { id: "u1", email: "a@b.c", name: "Tessa" } } as any);
    expect(t.id).toBe("u1");
    expect(t.name).toBe("Tessa");
  });
  it("refreshes name on an update trigger", async () => {
    const t = await jwtCallback({ token: { id: "u1", name: "Old" }, trigger: "update", session: { name: "New" } } as any);
    expect(t.name).toBe("New");
  });
  it("clears name when the update sets it null", async () => {
    const t = await jwtCallback({ token: { id: "u1", name: "Old" }, trigger: "update", session: { name: null } } as any);
    expect(t.name).toBeNull();
  });
});

describe("sessionCallback", () => {
  it("copies id and name from the token to session.user", async () => {
    const s = await sessionCallback({ session: { user: { email: "a@b.c" } }, token: { id: "u1", name: "Tessa" } } as any);
    expect((s.user as any).id).toBe("u1");
    expect(s.user!.name).toBe("Tessa");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL.** `npx vitest run src/lib/auth-callbacks.test.ts` (module `./auth-callbacks` does not exist yet).

- [ ] **Step 4: Implement.** Create `src/lib/auth-callbacks.ts`:

```ts
import type { JWT } from "next-auth/jwt";

export async function jwtCallback({ token, user, trigger, session }: any): Promise<JWT> {
  if (user) {
    token.id = user.id;
    token.name = user.name ?? null;
  }
  if (trigger === "update" && session && "name" in session) {
    token.name = session.name; // string | null
  }
  return token;
}

export async function sessionCallback({ session, token }: any) {
  if (session.user) {
    session.user.id = token.id as string;
    session.user.name = (token.name as string | null) ?? null;
  }
  return session;
}
```

Then in `src/lib/auth.ts`, import and wire: `callbacks: { jwt: jwtCallback, session: sessionCallback, signIn: ... }` (keep the existing `signIn` callback unchanged). Update the `Session` interface comment if needed; `name` is already `name?: string` — keep it.

- [ ] **Step 5: Run it — expect PASS.** `npx vitest run src/lib/auth-callbacks.test.ts`.

- [ ] **Step 6: Auth wiring check.** `npm run auth:verify` (ensures authOptions still valid).

- [ ] **Step 7: Commit.** `git add src/lib/auth.ts src/lib/auth-callbacks.ts src/lib/auth-callbacks.test.ts && git commit -m "feat(auth): carry + refresh display name through the session (purses-wew)"`

---

### Task 4: `ProfileForm` client component (purses-wew)

**Files:**
- Create: `src/features/profile/ProfileForm.tsx`
- Test: `src/features/profile/ProfileForm.test.tsx`

**Interfaces:**
- Consumes: `apiPatch` from `@/lib/api-client`; `useSession` from `next-auth/react`; `Input`, `Button`, `ErrorMessage` from `@/components/ui`.
- Produces: `<ProfileForm initialName={string | null} email={string} />` — PATCHes `/api/users/me` with `{ name }`, calls `useSession().update({ name })` on success, announces success/error via a live region.

- [ ] **Step 1: Read.** `graphify query "ProfileForm Input Button ErrorMessage apiPatch useSession update"`; read `src/features/collections/InviteForm.tsx` (the nearest form precedent) and `src/lib/api-client.ts` (`apiPatch` exists).

- [ ] **Step 2: Write the failing test** (`src/features/profile/ProfileForm.test.tsx`):

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ProfileForm } from "./ProfileForm";

const update = vi.fn();
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: {} }, update }) }));
const apiPatch = vi.fn().mockResolvedValue({ name: "Tessa" });
vi.mock("@/lib/api-client", () => ({ apiPatch: (...a: unknown[]) => apiPatch(...a) }));

beforeEach(() => { update.mockClear(); apiPatch.mockClear(); });

it("submits the trimmed name, refreshes the session, and confirms", async () => {
  render(<ProfileForm initialName={null} email="a@b.c" />);
  await userEvent.type(screen.getByLabelText(/name/i), "Tessa");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/api/users/me", { name: "Tessa" }));
  expect(update).toHaveBeenCalledWith({ name: "Tessa" });
  expect(screen.getByRole("status")).toHaveTextContent(/saved|your name/i);
});

it("submits an empty name to clear it", async () => {
  render(<ProfileForm initialName="Old" email="a@b.c" />);
  await userEvent.clear(screen.getByLabelText(/name/i));
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/api/users/me", { name: "" }));
});
```

- [ ] **Step 3: Run it — expect FAIL.** `npx vitest run src/features/profile/ProfileForm.test.tsx` (component missing).

- [ ] **Step 4: Implement** `src/features/profile/ProfileForm.tsx` (`"use client"`): controlled `name` input (default `initialName ?? ""`), `Input` with `label="Display name"`, a `Button` labelled "Save", submit handler that `apiPatch("/api/users/me", { name })`, then `update({ name })`, then sets a success message rendered in a `role="status"` live region; errors via `ErrorMessage` (route through it). Person-side copy ("This is the name shown across Adored"). ≥44px, tokens only, reduced-motion safe.

- [ ] **Step 5: Run it — expect PASS.** Same command.

- [ ] **Step 6: Commit.** `git add src/features/profile && git commit -m "feat(profile): editable display-name form (purses-wew)"`

---

### Task 5: `/profile` page + Header entry point (purses-wew)

**Files:**
- Create: `src/app/profile/page.tsx`
- Modify: `src/components/layout/Header.tsx` (link the name to `/profile`)
- Test: `src/components/layout/Header.test.tsx` (create/add)

**Interfaces:**
- Consumes: `getSession`, `getDb`, `UserController.fromDb(db).getCurrentUser`, `AppLayout`, `ProfileForm`.
- Produces: a protected `/profile` Server Component (redirects to `/login` when unauthenticated) rendering `ProfileForm`; Header user area links to `/profile`.

- [ ] **Step 1: Read.** `graphify query "profile page server component getSession AppLayout Header user area link"`; read `src/components/layout/Header.tsx` and a nearby protected page (e.g. `src/app/collections/[id]/members/page.tsx`) for the getSession→redirect + `UserController.fromDb(db)` pattern.

- [ ] **Step 2: Write the failing Header test** (`src/components/layout/Header.test.tsx`):

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Header } from "./Header";
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Tessa", email: "a@b.c" } } }),
  signOut: vi.fn(),
}));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

it("links the user's name to the profile page", () => {
  render(<Header />);
  const link = screen.getByRole("link", { name: /tessa/i });
  expect(link).toHaveAttribute("href", "/profile");
});
```

- [ ] **Step 3: Run it — expect FAIL.** `npx vitest run src/components/layout/Header.test.tsx` (name is plain text today, not a link).

- [ ] **Step 4: Implement.**
  - `Header.tsx`: wrap the `{session.user.name || session.user.email}` span in `<Link href="/profile">` with ≥44px tap area and a `:focus-visible` ring; keep the email fallback.
  - `src/app/profile/page.tsx`: `getSession()` → `redirect("/login")` if no user; load current user via `UserController.fromDb(getDb()).getCurrentUser(session.user.id)`; render `<AppLayout breadcrumbs={[{label:"Profile"}]}>` with a Playfair `h1` ("Your profile" or similar, `text-ink`) and `<ProfileForm initialName={user.name ?? null} email={user.email} />`.

- [ ] **Step 5: Run it — expect PASS.** Header test green.

- [ ] **Step 6: Build check.** `npm run build` (Server Component compiles; no client/server boundary errors).

- [ ] **Step 7: Commit.** `git add src/app/profile src/components/layout/Header.tsx src/components/layout/Header.test.tsx && git commit -m "feat(profile): profile page + header entry point (purses-wew)"`

---

### Task 6: e2e — name reflects in header (wew); verify-and-close y1o; cover asz

**Files:**
- Create: `e2e/profile.spec.ts`
- Create (only if not already covered): `e2e/login-protected.spec.ts` (purses-asz)
- Verify: `e2e/fixtures/ui.ts` already provides the shared helpers (purses-y1o)

**Interfaces:**
- Consumes: `submitLogin`, `sessionEmail`, `LOGGED_OUT`, `ROUTE` from `e2e/fixtures/ui.ts`; auth fixture from `e2e/fixtures/api-auth.ts` (no `/login` UI driving except the explicit asz spec — `e2e-auth-testing`).

- [ ] **Step 1: Read.** `graphify query "e2e auth.setup api-auth storageState authenticated spec"`; read `e2e/fixtures/api-auth.ts`, `e2e/auth-navigation.spec.ts`, and `e2e/auth.spec.ts`. Determine whether a UI-login→protected-page assertion (asz) already exists in `auth-navigation.spec.ts`.

- [ ] **Step 2: Write `e2e/profile.spec.ts` (wew).** Authenticate via the existing storageState fixture; `page.goto('/profile')`; fill the **labelled** "Display name" field with a unique value; click Save; assert the header reflects the new name **without a reload** (e.g. `await expect(page.getByRole('banner').getByText(uniqueName)).toBeVisible()`). Use the 3-viewport project setup already in `playwright.config.ts` (`e2e-harness-shape`).

- [ ] **Step 3: asz coverage.** If Step 1 found no UI-login→protected spec, create `e2e/login-protected.spec.ts`: `test.use({ storageState: LOGGED_OUT })`; `await submitLogin(page, <seeded creds>)`; `await page.goto('/collections')`; `await expect(page).toHaveURL(ROUTE.collections)`. If it already exists, note that in the commit and skip.

- [ ] **Step 4: Run e2e locally if Docker is available** (`npx playwright test e2e/profile.spec.ts e2e/login-protected.spec.ts` after the test DB + webServer come up per `playwright.config.ts`). If Docker is unavailable in this environment, state that explicitly — CI's required selective e2e job is the gate (this PR touches `src/app/**` + `e2e/**`, so it fires).

- [ ] **Step 5: y1o verify-and-close.** Confirm `e2e/fixtures/ui.ts` is imported by the existing specs and `auth.setup.ts` (the bead's reuse ask). It already exports `submitLogin`/`sessionEmail`/`hasHorizontalOverflow`/`LOGGED_OUT`/`ROUTE`/placeholders. Close purses-y1o with evidence (`bd close purses-y1o`), and purses-asz if covered.

- [ ] **Step 6: Commit.** `git add e2e/profile.spec.ts e2e/login-protected.spec.ts && git commit -m "test(e2e): display-name reflects in header; UI-login→protected (purses-wew, asz)"`

---

## Definition of done (PR1a)

- [ ] All tasks committed; `npm run build`, `npm run test:ci`, `npm run lint`, `npm run auth:verify` green; `RUN_DB_TESTS=1 npm run test:db` green for the new seam test.
- [ ] `graphify update .` run; `/sync-docs` (governance docs touched by new `src/app/profile` route + API behavior — likely `docs/API.md` for the name-only `PATCH /api/users/me` contract) before push.
- [ ] Light+dark screenshots of `/profile` (+ header showing the name) embedded inline in the PR body (`pr-screenshots`), verified in the signed-in browser.
- [ ] Whole-branch adversarial-review (UX/Design/a11y/Craftsman/QA) run; findings folded.
- [ ] CI green incl. the selective e2e job; PR merged; `bd close purses-wew` (and y1o/asz per Task 6) after merge via `/close-out`.

## Self-review notes

- **Spec coverage:** §5.1 maps to Tasks 1-6; y1o/asz folded into Task 6; ErrorMessage live-region (na0a) is intentionally **PR1b**, not here (PR1a's form uses `role="status"` for success inline and routes errors through the existing `ErrorMessage` — the live-region upgrade lands in PR1b alongside InviteForm).
- **Type consistency:** `updateCurrentUser(userId, { name })` (Task 2) ↔ `apiPatch("/api/users/me", { name })` (Task 4) ↔ `jwtCallback`/`sessionCallback` name carry (Task 3) ↔ Header link + `ProfileForm initialName` (Tasks 4-5). `name` is `string | null` end-to-end.
- **Placeholder scan:** no TBDs; every code step has concrete code or a concrete command.
