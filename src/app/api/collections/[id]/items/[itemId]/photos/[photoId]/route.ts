import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { requireApiCapability } from "@/server/dal/collection-access";
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
  const photoCtrl = PhotoController.fromDb(db);
  const itemCtrl = ItemController.fromDb(db);

  try {
    // Authz before existence (purses-ct0): the collection is in the URL, so a
    // non-curator never learns whether the item/photo exists.
    // photos:write = curator — any curator may rotate photos (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
    if (access instanceof NextResponse) return access;

    const item = await itemCtrl.getItem(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const photo = await photoCtrl.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let rotation: unknown;
    try {
      ({ rotation } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!(ALLOWED_ROTATIONS as readonly unknown[]).includes(rotation)) {
      return NextResponse.json({ error: "Invalid rotation" }, { status: 400 });
    }

    const updated = await photoCtrl.update(params.photoId, { rotation: rotation as number });
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
  const photoCtrl = PhotoController.fromDb(db);
  const itemCtrl = ItemController.fromDb(db);

  try {
    // Authz before existence (purses-ct0) — see PATCH above.
    // photos:write = curator — any curator may delete photos (full-curator model).
    // Curator-level by owner decision; attributed via audit (purses-opir/wfgj).
    const access = await requireApiCapability(db, params.id, actorId, "photos:write");
    if (access instanceof NextResponse) return access;

    // Verify item belongs to collection (belongs-to-parent).
    const item = await itemCtrl.getItem(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await photoCtrl.findById(params.photoId);
    if (!photo || photo.itemId !== params.itemId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Row delete + audit in ONE transaction via PhotoController.deleteWithAudit:
    // a committed delete always has exactly one audit row — if the audit insert
    // throws, the delete rolls back (purses-wfgj). Blob del + variant sweep are
    // external side effects that can't roll back, so they run post-commit (best-effort).
    await photoCtrl.deleteWithAudit(photo, actorId);

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
