import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { requireApiCollectionOwner } from "@/server/dal/collection-access";
import { ItemPurgeService, ItemInResultError } from "@/server/services/ItemPurgeService";

const PurgeConfirmSchema = z.object({ confirm: z.literal("PURGE") });

// Permanent owner-only purge. Order matters for security: authenticate, resolve
// the item (including soft-deleted), gate as the COLLECTION OWNER, and ONLY THEN
// parse the confirm body. A non-owner with a malformed body must get 403, never a
// 400 that would leak body validity as an existence/permission oracle.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const item = await new ItemRepository(db).findByIdIncludingDeleted(params.id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const owned = await requireApiCollectionOwner(db, item.collectionId, user.id);
    if (owned instanceof NextResponse) return owned; // 404 (absent) / 403 (not owner)

    // Authz passed — only now parse + validate the confirm body.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!PurgeConfirmSchema.safeParse(body).success) {
      return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
    }

    const service = new ItemPurgeService(db, new SortResultItemRepository(db));
    try {
      await service.purge(item, user.id);
    } catch (error) {
      if (error instanceof ItemInResultError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ message: "Item purged" });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
