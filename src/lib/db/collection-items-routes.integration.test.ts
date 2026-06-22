// @vitest-environment node
// Honest real-DB integration for the item routes: the real collection-scoped
// item list/create handler (GET/POST /api/collections/[id]/items) and the real
// top-level item handler (GET/PATCH/DELETE /api/items/[id]) -> ItemController ->
// ItemRepository -> ephemeral Postgres. Mocks ONLY the two true boundaries: auth
// (so we can drive owner / member / stranger) and getDb -> the test db. These
// routes touch no blob store, so no @vercel/blob mock.
//
// TWO DIFFERENT AUTHZ MODELS are pinned here:
//   - /api/collections/[id]/items uses requireApiCollectionAccess (member-or-owner;
//     404 absent collection / 403 outsider) — the correct, scoped gate.
//   - /api/items/[id] is requireAuth-ONLY (no collection scoping at all). That is a
//     cross-tenant IDOR gap tracked by purses-3al (fix owned by the pv9 epic). This
//     file PINS the current (gap) behavior: any authenticated user can read/patch/
//     delete ANY item, even one in a collection they have no access to. We assert
//     what the handler does TODAY, not what it should do.
//
// Every "gone after" / "unchanged" assertion is paired with a "present before" /
// "non-zero before" read, so a never-seeded row can't make the suite vacuously pass.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH @/lib/auth exports from one spy (spread/importActual pulls nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as listItems, POST as createItem } from "@/app/api/collections/[id]/items/route";
import {
  GET as getItem,
  PATCH as patchItem,
  DELETE as deleteItem,
} from "@/app/api/items/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handlers read via req.json(). Body omitted => no body. */
function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describeDb("item routes (route -> ItemController -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // =====================================================================
  // GET/POST /api/collections/[id]/items — member-or-owner gate (correct)
  // =====================================================================
  describe("GET /api/collections/[id]/items", () => {
    it("401s an unauthenticated caller", async () => {
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue(null);
      const res = await listItems(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(401);
    });

    it("403s a non-member of the collection", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await listItems(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(403);
    });

    it("404s an absent collection id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await listItems(jsonReq("GET") as any, { params: { id: "col-absent" } } as any);
      expect(res.status).toBe(404);
    });

    it("200s for the owner and lists the collection's real items in order", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const repo = new ItemRepository(db);
      // Non-vacuous guard: the list starts empty, then we seed exactly two.
      expect(await repo.findByCollection(collectionId)).toHaveLength(0);
      const a = await repo.create({ collectionId, name: "Item A" });
      const b = await repo.create({ collectionId, name: "Item B" });

      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await listItems(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.map((i: { id: string }) => i.id).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe("POST /api/collections/[id]/items", () => {
    it("401s an unauthenticated caller — and creates no item", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue(null);
      const res = await createItem(jsonReq("POST", { name: "x" }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(401);
      // Non-vacuous: a real collection existed to create into; nothing was created.
      expect(await new ItemRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("403s a non-member — and creates no item", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await createItem(jsonReq("POST", { name: "x" }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(403);
      expect(await new ItemRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("404s an absent collection id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await createItem(jsonReq("POST", { name: "x" }) as any, {
        params: { id: "col-absent" },
      } as any);
      expect(res.status).toBe(404);
    });

    it("rejects an invalid body (missing required name) — and creates no item", async () => {
      // purses-7jds: pins current (gap) behavior — the route does NOT wrap
      // ItemController.createItem (which runs CreateItemSchema.parse) in a try/catch.
      // An invalid body therefore makes the handler REJECT with a ZodError (which
      // Next.js maps to a 500 at the framework boundary) rather than returning a clean
      // 400 Response. The load-bearing invariant either way: NOTHING is persisted.
      // When 7jds is fixed, this should become a returned 400 with no throw.
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Non-vacuous: empty before.
      expect(await new ItemRepository(db).findByCollection(collectionId)).toHaveLength(0);

      await expect(
        createItem(jsonReq("POST", { brand: "no name here" }) as any, {
          params: { id: collectionId },
        } as any),
      ).rejects.toThrow(/name/i);

      // The contract that matters regardless of error shape: no row written.
      expect(await new ItemRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("201s for the owner and persists a real item (read back via repo)", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Non-vacuous guard: no items before the create.
      expect(await new ItemRepository(db).findByCollection(collectionId)).toHaveLength(0);

      const res = await createItem(
        jsonReq("POST", { name: "Cherished Tote", brand: "Coach", color: "tan" }) as any,
        { params: { id: collectionId } } as any,
      );
      expect(res.status).toBe(201);
      const body = await res.json();

      const persisted = await new ItemRepository(db).findById(body.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.collectionId).toBe(collectionId);
      expect(persisted!.name).toBe("Cherished Tote");
      expect(persisted!.brand).toBe("Coach");
      expect(persisted!.color).toBe("tan");
    });
  });

  // =====================================================================
  // GET/PATCH/DELETE /api/items/[id] — requireAuth-ONLY (purses-3al IDOR gap)
  // =====================================================================
  describe("GET /api/items/[id]", () => {
    it("401s an unauthenticated caller", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
      mockGetSession.mockResolvedValue(null);
      const res = await getItem(jsonReq("GET") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(401);
    });

    it("404s (NOT 500) for an absent item id", async () => {
      // Regression for the 500-not-404 bug the u3p purge e2e found: getItem returns
      // null for an absent/soft-deleted item, which the route maps to 404. Pair the
      // absent case with a present case (below) so this is non-vacuous.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getItem(jsonReq("GET") as any, { params: { id: "item-absent" } } as any);
      expect(res.status).toBe(404);
    });

    it("200s and returns a present item", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getItem(jsonReq("GET") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: item.id, name: "Bag" });
    });

    it("403s a stranger reading an item in a collection they cannot access", async () => {
      // purses-3al: items/[id] GET is now scoped to collection access — a non-member
      // gets 403 (the item still exists, the caller just lacks access).
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Owner's Bag" });
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await getItem(jsonReq("GET") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(403);
      // The item is untouched and still readable by the owner.
      expect(await new ItemRepository(db).findById(item.id)).not.toBeNull();
    });
  });

  describe("PATCH /api/items/[id]", () => {
    it("401s an unauthenticated caller — and does NOT mutate", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Original" });
      mockGetSession.mockResolvedValue(null);

      const res = await patchItem(jsonReq("PATCH", { name: "Hacked" }) as any, {
        params: { id: item.id },
      } as any);
      expect(res.status).toBe(401);
      // Present-before pairing: the name is untouched.
      expect((await new ItemRepository(db).findById(item.id))!.name).toBe("Original");
    });

    it("200s for an authenticated caller and persists the mutation", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Original" });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Present-before guard.
      expect((await new ItemRepository(db).findById(item.id))!.name).toBe("Original");

      const res = await patchItem(jsonReq("PATCH", { name: "Renamed", brand: "Gucci" }) as any, {
        params: { id: item.id },
      } as any);
      expect(res.status).toBe(200);

      const after = await new ItemRepository(db).findById(item.id);
      expect(after!.name).toBe("Renamed");
      expect(after!.brand).toBe("Gucci");
    });

    it("403s a stranger patching an item they cannot access — and does NOT mutate", async () => {
      // purses-3al: items/[id] PATCH is now scoped to collection access — a non-member
      // gets 403 and the item is left unchanged.
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Owner's" });
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await patchItem(jsonReq("PATCH", { name: "StrangerEdited" }) as any, {
        params: { id: item.id },
      } as any);
      expect(res.status).toBe(403);
      // The name is untouched — the stranger's edit did not persist.
      expect((await new ItemRepository(db).findById(item.id))!.name).toBe("Owner's");
    });
  });

  describe("DELETE /api/items/[id]", () => {
    it("401s an unauthenticated caller — and does NOT delete", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Keep" });
      mockGetSession.mockResolvedValue(null);

      const res = await deleteItem(jsonReq("DELETE") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(401);
      // Present-before pairing: still resolvable (not soft-deleted).
      expect(await new ItemRepository(db).findById(item.id)).not.toBeNull();
    });

    it("200s for an authenticated caller and soft-deletes it (present before, gone after)", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "ToDelete" });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Present before.
      expect(await new ItemRepository(db).findById(item.id)).not.toBeNull();

      const res = await deleteItem(jsonReq("DELETE") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(200);

      // Gone after (findById filters soft-deleted rows).
      expect(await new ItemRepository(db).findById(item.id)).toBeNull();
    });

    it("403s a stranger deleting an item they cannot access — and does NOT delete", async () => {
      // purses-3al: items/[id] DELETE is now scoped to collection access — a non-member
      // gets 403 and the item is left intact.
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const item = await new ItemRepository(db).create({ collectionId, name: "Owner's" });
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      // Present before.
      expect(await new ItemRepository(db).findById(item.id)).not.toBeNull();

      const res = await deleteItem(jsonReq("DELETE") as any, { params: { id: item.id } } as any);
      expect(res.status).toBe(403);
      // Still present — the stranger's delete did not take effect.
      expect(await new ItemRepository(db).findById(item.id)).not.toBeNull();
    });
  });
});
