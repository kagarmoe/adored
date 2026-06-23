/**
 * Filesystem-exhaustive route-enumeration authorization CI test (purses-o03).
 *
 * Walks every route.ts under src/app/api/**, derives the URL pattern and exported
 * HTTP methods, then asserts:
 *
 *   1. CATEGORIZATION EXHAUSTIVENESS — every discovered route+method is either in
 *      the PUBLIC_OR_SELF allowlist or exercised in the STRANGER ASSERTION below.
 *      An uncategorized route FAILS the test, naming the gap. A new unguarded route
 *      added later → CI red.
 *
 *   2. STRANGER ASSERTION — for every collection-scoped and curator-private
 *      route+method, invokes the real handler as a stranger (authenticated user S
 *      who is NOT a member of owner A's collection) and asserts status ∈ {403, 404}.
 *      Never 200, never a 2xx, never a 5xx (a 500 is a finding: authz must resolve
 *      to 403/404 before any error can occur).
 *
 * Mock strategy:
 *   - `@/lib/auth`: replace with mockAuth(mockGetSession) — standard pattern.
 *   - `@/lib/db`: redirect to getTestDb() — standard pattern.
 *   - `@vercel/blob` + `@vercel/blob/client`: the pool/upload route uses
 *     handleUpload whose onBeforeGenerateToken callback is where authz fires;
 *     the client library's handleUpload mock bypasses that callback entirely, so
 *     the authz gate is unreachable via this test harness. pool/upload is added
 *     to PUBLIC_OR_SELF (documented below) and its authz is tested in
 *     pool-routes.integration.test.ts.
 *
 * @vitest-environment node
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import {
  seedUserRow,
  seedFullCollection,
} from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";

// ── Auth + DB mocks (MUST be hoisted before any route import) ─────────────────

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Blob mocks: prevent any real network call. Pool/upload authz is unreachable
// through the handleUpload mock (see file-level comment above).
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.example/mock.jpg" }),
  del: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: "blob.upload-completed" }), { status: 200 }),
  ),
}));

// ── Filesystem helpers (reuse approach from ui-route-connectivity.test.ts) ───

function walkFiles(dir: string, ext: RegExp): string[] {
  const results: string[] = [];
  function recurse(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) recurse(full);
      else if (entry.isFile() && ext.test(entry.name)) results.push(full);
    }
  }
  recurse(dir);
  return results;
}

/**
 * Derive the normalised URL pattern from a route.ts absolute file path.
 * e.g. .../src/app/api/collections/[id]/items/route.ts → /api/collections/[param]/items
 */
function routePatternFromFile(filePath: string): string {
  const normalised = filePath.replace(/\\/g, "/");
  const marker = "src/app/";
  const idx = normalised.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot derive route pattern from ${filePath}`);
  let segment = normalised.slice(idx + marker.length);
  segment = segment.replace(/\/route\.ts$/, "");
  // Normalise every [segment] → [param]
  segment = segment.replace(/\[[^\]]+\]/g, "[param]");
  return "/" + segment;
}

/**
 * Extract exported HTTP method names from a route.ts source.
 * Handles `export async function GET(...)` and `export { handler as GET }`.
 */
function methodsFromRoute(src: string): string[] {
  const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
  const methods = new Set<string>();

  const fnRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src)) !== null) methods.add(m[1]);

  const reExportRe = /export\s*\{([^}]+)\}/g;
  while ((m = reExportRe.exec(src)) !== null) {
    const inner = m[1];
    const aliasRe = /\bas\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    let a: RegExpExecArray | null;
    while ((a = aliasRe.exec(inner)) !== null) methods.add(a[1]);
    for (const method of HTTP_METHODS) {
      const directRe = new RegExp(`(?:^|[,{\\s])${method}(?:[,}\\s]|$)`);
      if (directRe.test(inner) && !inner.includes(`as ${method}`)) methods.add(method);
    }
  }

  return Array.from(methods);
}

interface RouteEntry {
  file: string; // absolute path
  pattern: string; // e.g. /api/collections/[param]/items
  method: string;
  key: string; // `${method} ${pattern}` — canonical id used in sets
}

function discoverAllRoutes(repoRoot: string): RouteEntry[] {
  const apiDir = path.join(repoRoot, "src", "app", "api");
  const routeFiles = walkFiles(apiDir, /^route\.ts$/);
  const entries: RouteEntry[] = [];
  for (const abs of routeFiles) {
    const src = fs.readFileSync(abs, "utf-8");
    const pattern = routePatternFromFile(abs);
    const methods = methodsFromRoute(src);
    for (const method of methods) {
      entries.push({ file: abs, pattern, method, key: `${method} ${pattern}` });
    }
  }
  return entries;
}

// ── PUBLIC_OR_SELF allowlist ──────────────────────────────────────────────────
//
// Routes intentionally excluded from the stranger assertion with a rationale for each.
// ANY route not in this set and not in the stranger cases will FAIL the exhaustiveness check.

const PUBLIC_OR_SELF_KEYS = new Set<string>([
  // NextAuth catch-all: auth is delegated to NextAuth internals; no collection gate exists
  // or is needed. Credentials/OAuth provider callbacks are designed to be public/self.
  "GET /api/auth/[param]",
  "POST /api/auth/[param]",

  // Account signup: intentionally unauthenticated. Creates a new user; no collection scope.
  "POST /api/auth/signup",

  // Invitation accept:
  //   GET — public token preview (no session required, by design).
  //   POST — self-scoped: the invitee accepts their own invite; identity guard fires inside
  //          the handler (session email must match invitation email). Not collection-membership
  //          gated; the caller IS the stranger conceptually but must present a valid token.
  "GET /api/invitations/accept",
  "POST /api/invitations/accept",

  // Shared-results: the entire point is anonymous token-based read for outsiders.
  "GET /api/shared-results/[param]",

  // /users/me: self-resource only. Operates on the caller's own account — no collection gate
  // and no "stranger" concept (a stranger's /me is their own data).
  "GET /api/users/me",
  "PATCH /api/users/me",
  "DELETE /api/users/me",

  // /api/collections (list + create own): GET lists the caller's own collections only;
  // POST creates a new collection owned by the caller. Neither has a cross-tenant attack
  // surface — a stranger creating a collection is creating their own, which is correct.
  "GET /api/collections",
  "POST /api/collections",

  // pool/upload: collection-scoped, BUT the @vercel/blob/client mock bypasses the
  // onBeforeGenerateToken callback where requireApiCapability("photos:write") fires.
  // The authz gate is exercised in pool-routes.integration.test.ts instead.
  // This is the only mock-bypass exception; see file-level comment for rationale.
  "POST /api/collections/[param]/pool/upload",
]);

// ── Stranger test case builder ────────────────────────────────────────────────

interface StrangerCase {
  key: string;
  file: string; // absolute path to route.ts
  method: string;
  urlPath: string; // concrete URL path (seeded ids substituted)
  params: Record<string, string>; // Next.js route params
  body?: unknown;
  searchParams?: Record<string, string>;
}

function buildStrangerCases(
  repoRoot: string,
  ids: {
    collectionId: string;
    itemAId: string;
    itemBId: string;
    membershipId: string;
    sessionId: string;
    sortResultId: string;
    resultItemId: string;
    shareId: string;
    invitationId: string;
  },
): StrangerCase[] {
  const base = path.join(repoRoot, "src", "app", "api");

  function c(
    relFile: string,
    method: string,
    urlPath: string,
    params: Record<string, string>,
    body?: unknown,
    searchParams?: Record<string, string>,
  ): StrangerCase {
    const file = path.join(base, relFile);
    const pattern = routePatternFromFile(file);
    return { key: `${method} ${pattern}`, file, method, urlPath, params, body, searchParams };
  }

  const {
    collectionId,
    itemAId,
    itemBId,
    membershipId,
    sessionId,
    sortResultId,
    resultItemId,
    shareId,
    invitationId,
  } = ids;

  // NOTE on body: routes authz BEFORE parsing the body, so providing a body here
  // ensures a non-400 path. A 400 from body validation would indicate authz fires
  // AFTER body parse — which would be a finding.

  return [
    // ── /api/collections/[id] ──────────────────────────────────────────────
    c("collections/[id]/route.ts", "GET",
      `/api/collections/${collectionId}`,
      { id: collectionId }),
    c("collections/[id]/route.ts", "PATCH",
      `/api/collections/${collectionId}`,
      { id: collectionId },
      { name: "stranger rename" }),
    c("collections/[id]/route.ts", "DELETE",
      `/api/collections/${collectionId}`,
      { id: collectionId }),

    // ── /api/collections/[id]/archive & restore ────────────────────────────
    c("collections/[id]/archive/route.ts", "POST",
      `/api/collections/${collectionId}/archive`,
      { id: collectionId }),
    c("collections/[id]/restore/route.ts", "POST",
      `/api/collections/${collectionId}/restore`,
      { id: collectionId }),

    // ── /api/collections/[id]/purge ────────────────────────────────────────
    c("collections/[id]/purge/route.ts", "POST",
      `/api/collections/${collectionId}/purge`,
      { id: collectionId },
      // Body supplied: authz resolves before name check, so 403 expected.
      { confirm: "My Beloved Bags" }),

    // ── /api/collections/[id]/audit ────────────────────────────────────────
    c("collections/[id]/audit/route.ts", "GET",
      `/api/collections/${collectionId}/audit`,
      { id: collectionId }),

    // ── /api/collections/[id]/members ─────────────────────────────────────
    c("collections/[id]/members/route.ts", "GET",
      `/api/collections/${collectionId}/members`,
      { id: collectionId }),
    c("collections/[id]/members/route.ts", "POST",
      `/api/collections/${collectionId}/members`,
      { id: collectionId },
      { email: "new-member@adored.test" }),

    // ── /api/collections/[id]/members/[mid] ───────────────────────────────
    // PATCH removed (purses-2wzz): no UI caller; method no longer exported.
    c("collections/[id]/members/[mid]/route.ts", "GET",
      `/api/collections/${collectionId}/members/${membershipId}`,
      { id: collectionId, mid: membershipId }),
    c("collections/[id]/members/[mid]/route.ts", "DELETE",
      `/api/collections/${collectionId}/members/${membershipId}`,
      { id: collectionId, mid: membershipId }),

    // ── /api/collections/[id]/invitations ─────────────────────────────────
    c("collections/[id]/invitations/route.ts", "GET",
      `/api/collections/${collectionId}/invitations`,
      { id: collectionId }),
    c("collections/[id]/invitations/route.ts", "POST",
      `/api/collections/${collectionId}/invitations`,
      { id: collectionId },
      { email: "invite@adored.test" }),

    // ── /api/collections/[id]/items ───────────────────────────────────────
    c("collections/[id]/items/route.ts", "GET",
      `/api/collections/${collectionId}/items`,
      { id: collectionId }),
    c("collections/[id]/items/route.ts", "POST",
      `/api/collections/${collectionId}/items`,
      { id: collectionId },
      { name: "Stranger item" }),

    // ── /api/collections/[id]/items/[itemId] ──────────────────────────────
    c("collections/[id]/items/[itemId]/route.ts", "PATCH",
      `/api/collections/${collectionId}/items/${itemAId}`,
      { id: collectionId, itemId: itemAId },
      { name: "Stranger edit" }),

    // ── /api/collections/[id]/items/[itemId]/photos ───────────────────────
    // POST uploads a photo; authz fires first (requireApiCapability), then blob.
    c("collections/[id]/items/[itemId]/photos/route.ts", "POST",
      `/api/collections/${collectionId}/items/${itemAId}/photos`,
      { id: collectionId, itemId: itemAId }),

    // ── /api/collections/[id]/items/[itemId]/photos/[photoId] ─────────────
    // requireApiCapability fires before any photo lookup so nonexistent-photo-id → 403.
    c("collections/[id]/items/[itemId]/photos/[photoId]/route.ts", "PATCH",
      `/api/collections/${collectionId}/items/${itemAId}/photos/nonexistent-photo-id`,
      { id: collectionId, itemId: itemAId, photoId: "nonexistent-photo-id" },
      { rotation: 90 }),
    c("collections/[id]/items/[itemId]/photos/[photoId]/route.ts", "DELETE",
      `/api/collections/${collectionId}/items/${itemAId}/photos/nonexistent-photo-id`,
      { id: collectionId, itemId: itemAId, photoId: "nonexistent-photo-id" }),

    // ── /api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero ────
    c("collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.ts", "POST",
      `/api/collections/${collectionId}/items/${itemAId}/photos/nonexistent-photo-id/set-hero`,
      { id: collectionId, itemId: itemAId, photoId: "nonexistent-photo-id" }),

    // ── /api/collections/[id]/items/[itemId]/photos/[photoId]/file ────────
    c("collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts", "GET",
      `/api/collections/${collectionId}/items/${itemAId}/photos/nonexistent-photo-id/file`,
      { id: collectionId, itemId: itemAId, photoId: "nonexistent-photo-id" }),

    // ── /api/collections/[id]/pool/group ──────────────────────────────────
    c("collections/[id]/pool/group/route.ts", "POST",
      `/api/collections/${collectionId}/pool/group`,
      { id: collectionId },
      { photoIds: [] }),

    // ── /api/collections/[id]/pool/photos ─────────────────────────────────
    c("collections/[id]/pool/photos/route.ts", "GET",
      `/api/collections/${collectionId}/pool/photos`,
      { id: collectionId }),

    // ── /api/collections/[id]/pool/photos/[photoId]/file ──────────────────
    c("collections/[id]/pool/photos/[photoId]/file/route.ts", "GET",
      `/api/collections/${collectionId}/pool/photos/nonexistent-pool-photo/file`,
      { id: collectionId, photoId: "nonexistent-pool-photo" }),

    // ── /api/collections/[id]/photos/reassign ─────────────────────────────
    c("collections/[id]/photos/reassign/route.ts", "POST",
      `/api/collections/${collectionId}/photos/reassign`,
      { id: collectionId },
      { photoIds: [], destination: { type: "pool" } }),

    // ── /api/collections/[id]/preferences/items ───────────────────────────
    c("collections/[id]/preferences/items/route.ts", "GET",
      `/api/collections/${collectionId}/preferences/items`,
      { id: collectionId }),

    // ── /api/collections/[id]/preferences/recalculate ─────────────────────
    c("collections/[id]/preferences/recalculate/route.ts", "POST",
      `/api/collections/${collectionId}/preferences/recalculate`,
      { id: collectionId }),

    // ── /api/items (top-level, scoped via collectionId query-param) ────────
    c("items/route.ts", "POST",
      `/api/items`,
      {},
      { name: "stranger item" },
      { collectionId }),

    // ── /api/items/[id] ───────────────────────────────────────────────────
    c("items/[id]/route.ts", "GET",
      `/api/items/${itemAId}`,
      { id: itemAId }),
    c("items/[id]/route.ts", "PATCH",
      `/api/items/${itemAId}`,
      { id: itemAId },
      { name: "stranger patch" }),
    c("items/[id]/route.ts", "DELETE",
      `/api/items/${itemAId}`,
      { id: itemAId }),

    // ── /api/items/[id]/restore ───────────────────────────────────────────
    // itemBId's photo was soft-deleted in seedFullCollection; the item itself is active.
    // Use itemBId as the restore target so the item resolves (restore uses includeDeleted).
    c("items/[id]/restore/route.ts", "POST",
      `/api/items/${itemBId}/restore`,
      { id: itemBId }),

    // ── /api/items/[id]/purge ─────────────────────────────────────────────
    c("items/[id]/purge/route.ts", "POST",
      `/api/items/${itemAId}/purge`,
      { id: itemAId },
      { confirm: "PURGE" }),

    // ── /api/items/[id]/remove-from-sorts ────────────────────────────────
    c("items/[id]/remove-from-sorts/route.ts", "POST",
      `/api/items/${itemAId}/remove-from-sorts`,
      { id: itemAId }),

    // ── /api/invitations/[id] ─────────────────────────────────────────────
    c("invitations/[id]/route.ts", "GET",
      `/api/invitations/${invitationId}`,
      { id: invitationId }),
    c("invitations/[id]/route.ts", "PATCH",
      `/api/invitations/${invitationId}`,
      { id: invitationId },
      { status: "revoked" }),
    c("invitations/[id]/route.ts", "DELETE",
      `/api/invitations/${invitationId}`,
      { id: invitationId }),

    // ── /api/invitations/[id]/resend ──────────────────────────────────────
    c("invitations/[id]/resend/route.ts", "POST",
      `/api/invitations/${invitationId}/resend`,
      { id: invitationId }),

    // ── /api/sessions (curator-private, body.collectionId gate) ───────────
    // The stranger sends a valid collectionId; requireApiCollectionAccess → 403.
    c("sessions/route.ts", "POST",
      `/api/sessions`,
      {},
      { collectionId, goal: "stranger goal" }),

    // ── /api/sessions/[id] (curator-private) ──────────────────────────────
    // sessionId belongs to the owner. Stranger fails collection-membership gate → 403.
    c("sessions/[id]/route.ts", "GET",
      `/api/sessions/${sessionId}`,
      { id: sessionId }),
    c("sessions/[id]/route.ts", "PATCH",
      `/api/sessions/${sessionId}`,
      { id: sessionId },
      { goal: "stranger update" }),
    c("sessions/[id]/route.ts", "DELETE",
      `/api/sessions/${sessionId}`,
      { id: sessionId }),

    // ── /api/sessions/[id]/decisions (curator-private) ────────────────────
    c("sessions/[id]/decisions/route.ts", "POST",
      `/api/sessions/${sessionId}/decisions`,
      { id: sessionId },
      { type: "triage", decision: { itemId: itemAId, result: "top" } }),

    // ── /api/sort-results (curator-private, body.collectionId gate) ────────
    c("sort-results/route.ts", "POST",
      `/api/sort-results`,
      {},
      { collectionId, name: "Stranger result" }),

    // ── /api/sort-results/[id] (curator-private) ──────────────────────────
    // sortResultId belongs to the owner. Stranger fails collection-membership gate.
    c("sort-results/[id]/route.ts", "GET",
      `/api/sort-results/${sortResultId}`,
      { id: sortResultId }),
    c("sort-results/[id]/route.ts", "PATCH",
      `/api/sort-results/${sortResultId}`,
      { id: sortResultId },
      { name: "Stranger rename" }),
    c("sort-results/[id]/route.ts", "DELETE",
      `/api/sort-results/${sortResultId}`,
      { id: sortResultId }),

    // ── /api/sort-results/[id]/finalize ───────────────────────────────────
    c("sort-results/[id]/finalize/route.ts", "POST",
      `/api/sort-results/${sortResultId}/finalize`,
      { id: sortResultId }),

    // ── /api/sort-results/[id]/supersede ──────────────────────────────────
    c("sort-results/[id]/supersede/route.ts", "POST",
      `/api/sort-results/${sortResultId}/supersede`,
      { id: sortResultId }),

    // ── /api/sort-results/[id]/items ──────────────────────────────────────
    c("sort-results/[id]/items/route.ts", "GET",
      `/api/sort-results/${sortResultId}/items`,
      { id: sortResultId }),

    // ── /api/sort-results/[id]/items/[rid] ────────────────────────────────
    c("sort-results/[id]/items/[rid]/route.ts", "GET",
      `/api/sort-results/${sortResultId}/items/${resultItemId}`,
      { id: sortResultId, rid: resultItemId }),
    c("sort-results/[id]/items/[rid]/route.ts", "PATCH",
      `/api/sort-results/${sortResultId}/items/${resultItemId}`,
      { id: sortResultId, rid: resultItemId },
      { manualBucket: "top" }),
    c("sort-results/[id]/items/[rid]/route.ts", "DELETE",
      `/api/sort-results/${sortResultId}/items/${resultItemId}`,
      { id: sortResultId, rid: resultItemId }),

    // ── /api/sort-results/[id]/items/[rid]/reset ──────────────────────────
    c("sort-results/[id]/items/[rid]/reset/route.ts", "POST",
      `/api/sort-results/${sortResultId}/items/${resultItemId}/reset`,
      { id: sortResultId, rid: resultItemId }),

    // ── /api/sort-results/[id]/shares ─────────────────────────────────────
    c("sort-results/[id]/shares/route.ts", "GET",
      `/api/sort-results/${sortResultId}/shares`,
      { id: sortResultId }),
    // NOTE: POST /shares parses body BEFORE the authz gate (body then requireApiResultAccess).
    // Provide a valid body so json() succeeds and the authz gate is reached.
    // A 400 here would indicate the body is parsed before authz — which is a finding.
    c("sort-results/[id]/shares/route.ts", "POST",
      `/api/sort-results/${sortResultId}/shares`,
      { id: sortResultId },
      { label: "stranger share" }),

    // ── /api/sort-results/[id]/shares/[sid] ───────────────────────────────
    c("sort-results/[id]/shares/[sid]/route.ts", "GET",
      `/api/sort-results/${sortResultId}/shares/${shareId}`,
      { id: sortResultId, sid: shareId }),
    c("sort-results/[id]/shares/[sid]/route.ts", "PATCH",
      `/api/sort-results/${sortResultId}/shares/${shareId}`,
      { id: sortResultId, sid: shareId },
      { label: "v2" }),
    c("sort-results/[id]/shares/[sid]/route.ts", "DELETE",
      `/api/sort-results/${sortResultId}/shares/${shareId}`,
      { id: sortResultId, sid: shareId }),
  ];
}

// ── Dynamic handler importer ──────────────────────────────────────────────────

async function importHandler(
  repoRoot: string,
  absoluteFile: string,
  method: string,
): Promise<(req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>> {
  const rel = path.relative(repoRoot, absoluteFile).replace(/\\/g, "/");
  // rel is e.g. "src/app/api/collections/[id]/route.ts"
  // Convert to the @/ alias (tsconfig maps @/ → src/).
  const atAlias = rel.startsWith("src/") ? "@/" + rel.slice("src/".length) : rel;
  const mod = await import(/* @vite-ignore */ atAlias) as Record<string, unknown>;
  const fn = mod[method];
  if (typeof fn !== "function") {
    throw new Error(`No export named "${method}" in ${absoluteFile}`);
  }
  return fn as (req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>;
}

// ── Request factory ───────────────────────────────────────────────────────────

function makeReq(
  method: string,
  urlPath: string,
  body?: unknown,
  searchParams?: Record<string, string>,
): NextRequest {
  let url = `http://localhost${urlPath}`;
  if (searchParams && Object.keys(searchParams).length > 0) {
    url += `?${new URLSearchParams(searchParams).toString()}`;
  }
  const headers: Record<string, string> = {};
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    bodyStr = JSON.stringify(body);
  }
  return new NextRequest(url, { method, headers, body: bodyStr });
}

// ── describeDb gate ───────────────────────────────────────────────────────────

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ── Test suite ────────────────────────────────────────────────────────────────

describeDb(
  "route-authz-enumeration: filesystem-exhaustive stranger-403/404 backstop (purses-o03)",
  () => {
    const REPO_ROOT = path.resolve(__dirname, "../../..");

    // IDs seeded once for the entire suite (beforeAll, single resetDb).
    let ids: Parameters<typeof buildStrangerCases>[1];

    beforeAll(async () => {
      await resetDb();
      vi.clearAllMocks();

      // Owner A — owns the collection.
      const ownerId = await seedUserRow("authz-enum-owner");

      // Stranger S — authenticated but NOT a member of owner's collection.
      const strangerId = await seedUserRow("authz-enum-stranger");

      // Full collection: items, photos, session, draft+finalized results, share, invitation.
      const seeds = await seedFullCollection(ownerId);
      const { db } = getTestDb();
      const { sql } = await import("drizzle-orm");

      // Draft sort result (the one the stranger will attempt to access).
      const [resultRow] = await db.execute<{ id: string }>(
        sql`SELECT id FROM sort_results WHERE collection_id = ${seeds.collectionId} AND status = 'draft' LIMIT 1`,
      );
      if (!resultRow) throw new Error("seedFullCollection must create a draft sort result");

      // Share (from the finalized result).
      const [shareRow] = await db.execute<{ id: string }>(
        sql`SELECT id FROM sort_result_shares LIMIT 1`,
      );
      if (!shareRow) throw new Error("seedFullCollection must create a sort result share");

      // A result item on the draft result.
      const [resultItemRow] = await db.execute<{ id: string }>(
        sql`SELECT id FROM sort_result_items WHERE sort_result_id = ${resultRow.id} LIMIT 1`,
      );
      if (!resultItemRow) throw new Error("seedFullCollection must create a sort result item on the draft");

      // An invitation on the collection.
      const [invitationRow] = await db.execute<{ id: string }>(
        sql`SELECT id FROM invitations WHERE collection_id = ${seeds.collectionId} LIMIT 1`,
      );
      if (!invitationRow) throw new Error("seedFullCollection must create an invitation");

      // The curator member's membership row.
      const [membershipRow] = await db.execute<{ id: string }>(
        sql`SELECT id FROM memberships WHERE user_id = ${seeds.memberId} AND collection_id = ${seeds.collectionId} LIMIT 1`,
      );
      if (!membershipRow) throw new Error("seedFullCollection must create a curator membership row");

      ids = {
        collectionId: seeds.collectionId,
        itemAId: seeds.itemAId,
        itemBId: seeds.itemBId,
        membershipId: membershipRow.id,
        sessionId: seeds.sessionId,
        sortResultId: resultRow.id,
        resultItemId: resultItemRow.id,
        shareId: shareRow.id,
        invitationId: invitationRow.id,
      };

      // Wire stranger session for all handler calls.
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
    });

    afterAll(async () => {
      await closeDb();
    });

    // ────────────────────────────────────────────────────────────────────────
    // Test 1: CATEGORIZATION EXHAUSTIVENESS
    //
    // Every discovered route+method must be in exactly one of:
    //   A) PUBLIC_OR_SELF_KEYS — explicitly allowlisted above, or
    //   B) the stranger cases returned by buildStrangerCases() — exercised below.
    //
    // If a route is in neither → test FAILS naming the uncategorized route.
    // This is the backstop: a new unguarded route → CI red immediately.
    // ────────────────────────────────────────────────────────────────────────

    it("every discovered route+method is categorized (PUBLIC_OR_SELF or exercised-as-stranger)", () => {
      const discovered = discoverAllRoutes(REPO_ROOT);
      // Build stranger cases using a fake ids object (pattern derivation only; no DB needed here).
      const fakeIds = {
        collectionId: "fake", itemAId: "fake", itemBId: "fake", membershipId: "fake",
        sessionId: "fake", sortResultId: "fake", resultItemId: "fake",
        shareId: "fake", invitationId: "fake",
      };
      const strangerKeys = new Set(buildStrangerCases(REPO_ROOT, fakeIds).map((c) => c.key));

      const uncategorized: string[] = [];
      for (const r of discovered) {
        if (!PUBLIC_OR_SELF_KEYS.has(r.key) && !strangerKeys.has(r.key)) {
          uncategorized.push(`  ${r.key}  (${r.file})`);
        }
      }

      if (uncategorized.length > 0) {
        throw new Error(
          `${uncategorized.length} route+method(s) are neither in PUBLIC_OR_SELF nor exercised as a stranger.\n` +
            `Every route MUST be explicitly categorized — add it to PUBLIC_OR_SELF_KEYS (with rationale)\n` +
            `or add a stranger case in buildStrangerCases().\n\n` +
            `Uncategorized:\n` + uncategorized.join("\n"),
        );
      }

      // Sanity: no key is in both sets (logic error in the test itself).
      const overlap = [...PUBLIC_OR_SELF_KEYS].filter((k) => strangerKeys.has(k));
      expect(overlap, "A key must not appear in both PUBLIC_OR_SELF and stranger cases").toHaveLength(0);

      // Sanity: we must have discovered a meaningful number of routes.
      expect(discovered.length, "Should discover at least 40 route+method entries").toBeGreaterThanOrEqual(40);
    });

    // ────────────────────────────────────────────────────────────────────────
    // Test 2: STRANGER ASSERTION
    //
    // For every collection-scoped and curator-private route+method, invoke the
    // real handler as the stranger and assert status ∈ {403, 404}.
    // A 200 means the route is unguarded → fail.
    // A 500 means authz didn't resolve before an error occurred → fail.
    // ────────────────────────────────────────────────────────────────────────

    it("stranger (non-member) gets 403 or 404 on every collection-scoped and curator-private route", async () => {
      const cases = buildStrangerCases(REPO_ROOT, ids);
      const failures: string[] = [];

      for (const tc of cases) {
        let res: Response;
        try {
          const handler = await importHandler(REPO_ROOT, tc.file, tc.method);
          const req = makeReq(tc.method, tc.urlPath, tc.body, tc.searchParams);
          res = await handler(req, { params: tc.params });
        } catch (err) {
          failures.push(
            `  ${tc.key}  [${tc.urlPath}] — handler threw instead of returning a response: ${err}`,
          );
          continue;
        }

        if (res.status !== 403 && res.status !== 404) {
          failures.push(
            `  ${tc.key}  [${tc.urlPath}] — expected 403 or 404, got HTTP ${res.status}`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.length} route+method(s) did NOT return 403/404 for a non-member stranger:\n` +
            failures.join("\n"),
        );
      }

      // Sanity: we must have exercised a meaningful set of routes.
      expect(cases.length, "Should exercise at least 50 stranger cases").toBeGreaterThanOrEqual(50);
    });
  },
);
