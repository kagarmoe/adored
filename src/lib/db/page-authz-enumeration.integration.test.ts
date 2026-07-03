/**
 * Filesystem-exhaustive PAGE-enumeration authorization CI test (purses-6fk).
 *
 * The route enumeration test (route-authz-enumeration.integration.test.ts) walks
 * src/app/api/** only; Server Component PAGES are its blind spot. A new page under
 * src/app/collections/**\/page.tsx that forgets requireCollectionAccess, or fetches
 * before it, ships green. This test is the symmetric backstop for pages.
 *
 * It walks every page.tsx under src/app/collections/** and asserts:
 *
 *   1. CATEGORIZATION EXHAUSTIVENESS — every discovered page is either in the
 *      PUBLIC_PAGES allowlist (with a written rationale) or exercised in the
 *      STRANGER ASSERTION below. An uncategorized page FAILS the test, naming the
 *      gap. A new unguarded page added later → CI red, forcing a decision.
 *
 *   2. STRANGER ASSERTION — for every collection-scoped page, invoke the real page
 *      component's default export as an authenticated STRANGER (a real user who is
 *      NOT a member of owner A's seeded collection) and assert it REDIRECTS
 *      (to /collections or /login) — i.e. no protected data is returned. The page
 *      guard (requireCollectionAccess / requireCollectionOwnerPage) calls Next's
 *      redirect(), which throws to halt rendering BEFORE any protected data query
 *      runs; we assert that throw. A page that renders (returns JSX) instead of
 *      throwing means the guard is missing or runs after a data fetch → FAIL.
 *
 * Why invoke, not full-render: the guard fires in the async function body before
 * any JSX is constructed, so invoking the default export and catching the thrown
 * NEXT_REDIRECT proves the guard bites without needing an RSC render runtime.
 * (The page modules import cleanly under @vitest-environment node — verified.)
 *
 * Mock strategy (mirrors collection-access-page.integration.test.ts):
 *   - `next/navigation`: redirect() throws `NEXT_REDIRECT:${url}` so we can observe
 *     the target without a Next runtime; notFound() throws `NEXT_NOTFOUND`.
 *   - `@/lib/auth`: getSession() returns the stranger's session.
 *   - `@/lib/db`: redirect to getTestDb() — real repos, real Postgres.
 *
 * @vitest-environment node
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedUserRow, seedFullCollection } from "../../../e2e/fixtures/seed";

// ── Mocks (MUST be hoisted before any page import) ────────────────────────────
//
// redirect() in Next throws to halt rendering; mirror that so the guard
// short-circuits and we can observe the redirect target.
const { mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: () => {
    throw new Error("NEXT_NOTFOUND");
  },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// ── Filesystem helpers ────────────────────────────────────────────────────────

function walkFiles(dir: string, ext: RegExp): string[] {
  const results: string[] = [];
  function recurse(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) recurse(full);
      else if (entry.isFile() && ext.test(entry.name)) results.push(full);
    }
  }
  recurse(dir);
  return results;
}

/**
 * Derive the normalised page pattern from a page.tsx absolute path.
 * e.g. .../src/app/collections/[id]/items/[itemNumber]/page.tsx
 *   → collections/[param]/items/[param]
 */
function pagePatternFromFile(filePath: string): string {
  const normalised = filePath.replace(/\\/g, "/");
  const marker = "src/app/";
  const idx = normalised.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot derive page pattern from ${filePath}`);
  let segment = normalised.slice(idx + marker.length);
  segment = segment.replace(/\/page\.tsx$/, "");
  segment = segment.replace(/\[[^\]]+\]/g, "[param]");
  return segment;
}

// ── PUBLIC_PAGES allowlist ────────────────────────────────────────────────────
//
// Pages intentionally excluded from the stranger assertion, each with a rationale.
// ANY collections/** page not in this set and not in the stranger cases FAILS the
// exhaustiveness check — adding a page forces a categorization decision.
//
// NOTE: only pages UNDER src/app/collections/** are discovered here (the guarded
// surface). Top-level public pages (login, signup, welcome, invitations/[token],
// shared-results/[token], profile, root) live outside collections/** and so are
// out of scope for this walk by construction — documented here for the reader.
const PUBLIC_PAGES = new Set<string>([
  // Lists the caller's OWN collections only (listCollections(session.user.id));
  // self-scoped, no cross-tenant surface. A stranger sees only their own (empty) list.
  "collections",

  // Creates a NEW collection owned by the caller; takes no collectionId, so there is
  // no other tenant's resource to reach. A "stranger" here is creating their own.
  "collections/new",
]);

// ── Stranger page-case builder ────────────────────────────────────────────────
//
// One entry per collection-scoped page. params.id is the seeded owner's collection
// id; nested route params (itemNumber, sessionNumber, resultNumber) are arbitrary —
// the collection-access guard runs on params.id FIRST and redirects the stranger
// before any nested lookup, so their values are irrelevant to the assertion.

interface StrangerPageCase {
  pattern: string; // canonical id, matches pagePatternFromFile
  importPath: string; // @/ alias for dynamic import
  params: Record<string, string>;
}

function buildStrangerPageCases(collectionId: string): StrangerPageCase[] {
  const N = "1"; // arbitrary nested number; guard redirects before it is used
  const p = (
    relDir: string,
    params: Record<string, string>,
  ): StrangerPageCase => {
    const importPath = `@/app/${relDir}/page`;
    const pattern = relDir.replace(/\[[^\]]+\]/g, "[param]");
    return { pattern, importPath, params };
  };

  const id = collectionId;
  return [
    p("collections/[id]", { id }),
    p("collections/[id]/edit", { id }),
    p("collections/[id]/items", { id }),
    p("collections/[id]/items/new", { id }),
    p("collections/[id]/items/[itemNumber]", { id, itemNumber: N }),
    p("collections/[id]/items/[itemNumber]/edit", { id, itemNumber: N }),
    p("collections/[id]/items/[itemNumber]/photos", { id, itemNumber: N }),
    p("collections/[id]/members", { id }),
    p("collections/[id]/pool", { id }),
    p("collections/[id]/results", { id }),
    p("collections/[id]/results/[resultNumber]", { id, resultNumber: N }),
    p("collections/[id]/results/[resultNumber]/finalize", { id, resultNumber: N }),
    p("collections/[id]/sort", { id }),
    p("collections/[id]/sort/new", { id }),
    p("collections/[id]/sort/set-aside", { id }),
    p("collections/[id]/sort/[sessionNumber]", { id, sessionNumber: N }),
    p("collections/[id]/sort/[sessionNumber]/triage", { id, sessionNumber: N }),
    p("collections/[id]/sort/[sessionNumber]/compare", { id, sessionNumber: N }),
  ];
}

// ── describeDb gate ───────────────────────────────────────────────────────────

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ── Test suite ────────────────────────────────────────────────────────────────

describeDb(
  "page-authz-enumeration: filesystem-exhaustive stranger-redirect backstop (purses-6fk)",
  () => {
    const REPO_ROOT = path.resolve(__dirname, "../../..");
    const COLLECTIONS_DIR = path.join(REPO_ROOT, "src", "app", "collections");

    let collectionId: string;

    beforeAll(async () => {
      await resetDb();
      vi.clearAllMocks();

      // Owner A owns the collection; stranger S is authenticated but NOT a member.
      const ownerId = await seedUserRow("page-authz-owner");
      const strangerId = await seedUserRow("page-authz-stranger");
      const seeds = await seedFullCollection(ownerId);
      collectionId = seeds.collectionId;

      // Every page invocation runs as the stranger.
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
    });

    afterAll(async () => {
      await closeDb();
    });

    // ────────────────────────────────────────────────────────────────────────
    // Test 1: CATEGORIZATION EXHAUSTIVENESS
    //
    // Every discovered collections/** page must be in exactly one of:
    //   A) PUBLIC_PAGES — explicitly allowlisted above (with rationale), or
    //   B) the stranger cases from buildStrangerPageCases() — exercised below.
    // A page in neither → FAIL, naming it. A new unguarded page → CI red.
    // ────────────────────────────────────────────────────────────────────────
    it("every discovered collections/** page is categorized (PUBLIC_PAGES or exercised-as-stranger)", () => {
      const discovered = walkFiles(COLLECTIONS_DIR, /^page\.tsx$/).map(
        pagePatternFromFile,
      );
      const strangerPatterns = new Set(
        buildStrangerPageCases("fake").map((c) => c.pattern),
      );

      const uncategorized = discovered.filter(
        (pat) => !PUBLIC_PAGES.has(pat) && !strangerPatterns.has(pat),
      );

      if (uncategorized.length > 0) {
        throw new Error(
          `${uncategorized.length} collections/** page(s) are neither in PUBLIC_PAGES nor exercised as a stranger.\n` +
            `Every page MUST be explicitly categorized — add it to PUBLIC_PAGES (with rationale)\n` +
            `or add a stranger case in buildStrangerPageCases().\n\n` +
            `Uncategorized:\n` +
            uncategorized.map((p) => `  ${p}`).join("\n"),
        );
      }

      // Sanity: no pattern appears in both sets (a logic error in this test).
      const overlap = [...PUBLIC_PAGES].filter((p) => strangerPatterns.has(p));
      expect(
        overlap,
        "A page must not appear in both PUBLIC_PAGES and stranger cases",
      ).toHaveLength(0);

      // Sanity: every stranger pattern maps to a real discovered page (no typos).
      const discoveredSet = new Set(discovered);
      const phantom = [...strangerPatterns].filter((p) => !discoveredSet.has(p));
      expect(
        phantom,
        "Every stranger case must correspond to a real page.tsx on disk",
      ).toHaveLength(0);

      // Sanity: we discovered a meaningful number of pages.
      expect(
        discovered.length,
        "Should discover at least 18 collection pages",
      ).toBeGreaterThanOrEqual(18);
    });

    // ────────────────────────────────────────────────────────────────────────
    // Test 2: STRANGER ASSERTION
    //
    // For every collection-scoped page, invoke the default export as the stranger
    // and assert it throws NEXT_REDIRECT to /collections or /login — i.e. it never
    // returns protected data. A page that resolves (returns JSX) → FAIL. A redirect
    // to anywhere else, or a NEXT_NOTFOUND, is also a FAIL (the contract is:
    // strangers are bounced to /collections or /login, no protected render).
    // ────────────────────────────────────────────────────────────────────────
    it("stranger (non-member) is redirected away from every collection-scoped page (no protected render)", async () => {
      const cases = buildStrangerPageCases(collectionId);
      const failures: string[] = [];

      for (const tc of cases) {
        let outcome: string;
        try {
          const mod = (await import(/* @vite-ignore */ tc.importPath)) as {
            default: (props: { params: Record<string, string> }) => Promise<unknown>;
          };
          await mod.default({ params: tc.params });
          outcome = "RESOLVED (returned a render instead of redirecting)";
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg === "NEXT_REDIRECT:/collections" ||
            msg === "NEXT_REDIRECT:/login"
          ) {
            continue; // correct: bounced away, no protected data
          }
          outcome = `threw ${msg}`;
        }
        failures.push(`  ${tc.pattern} — expected redirect to /collections or /login, but ${outcome}`);
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.length} collection page(s) did NOT redirect a non-member stranger to /collections or /login:\n` +
            failures.join("\n"),
        );
      }

      // Sanity: mockRedirect actually fired (the mechanism works, not a no-op pass).
      expect(mockRedirect).toHaveBeenCalled();

      // Sanity: we exercised a meaningful set of pages.
      expect(
        cases.length,
        "Should exercise at least 18 stranger page cases",
      ).toBeGreaterThanOrEqual(18);
    });
  },
);
