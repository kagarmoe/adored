import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";
import { withTransaction } from "@/lib/transactions";
import { del } from "@vercel/blob";
import { ALLOWED_ROTATIONS } from "@/lib/photos";
import { deleteVariants, variantPrefix } from "@/lib/photo-variants";

// Rotate a photo (persisted, non-destructive). photos:write = curator (full-curator model).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const photoRepo = new PhotoRepository(db);
  const itemRepo = new ItemRepository(db);

  try {
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // photos:write = curator — any curator may rotate photos (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
    if (access instanceof NextResponse) return access;

    let rotation: unknown;
    try {
      ({ rotation } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!(ALLOWED_ROTATIONS as readonly unknown[]).includes(rotation)) {
      return NextResponse.json({ error: "Invalid rotation" }, { status: 400 });
    }

    const updated = await photoRepo.update(params.photoId, { rotation: rotation as number });
    return NextResponse.json({ rotation: updated.rotation, updatedAt: updated.updatedAt });
  } catch {
    return NextResponse.json({ error: "Rotate failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Capture before the tx closure — TS loses the `!session?.user` narrowing inside
  // an async callback, and this is the audit actor.
  const actorId = session.user.id;

  const db = getDb();
  const photoRepo = new PhotoRepository(db);
  const itemRepo = new ItemRepository(db);

  try {
    // Verify item belongs to collection (belongs-to-parent).
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // photos:write = curator — any curator may delete photos (full-curator model).
    // Curator-level by owner decision; attributed via audit (purses-opir/wfgj).
    const access = await requireApiCapability(db, params.id, actorId, "photos:write");
    if (access instanceof NextResponse) return access;

    const photo = await photoRepo.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Row soft-delete + audit in ONE transaction (mirrors ItemPurgeService): a
    // committed delete always has exactly one audit row — if the audit insert
    // throws, the soft-delete rolls back, so a photo is never deleted without
    // attribution (purses-wfgj). Blob del + variant sweep are external side
    // effects that can't roll back, so they run post-commit (best-effort).
    await withTransaction(db, async (tx) => {
      await new PhotoRepository(tx).delete(params.photoId);
      await new AuditLogRepository(tx).record({
        actorId,
        action: "photo.delete",
        targetType: "photo",
        targetId: photo.id,
        collectionId: params.id,
      });
    });

    // Best-effort, post-commit: only http(s) keys are real blob URLs; a del
    // failure is inert (orphaned, sweepable) — the DB delete already committed.
    if (photo.blobKey.startsWith("http")) {
      await del(photo.blobKey);
    }
    await deleteVariants(variantPrefix(params.id, params.photoId)).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 }
    );
  }
}
