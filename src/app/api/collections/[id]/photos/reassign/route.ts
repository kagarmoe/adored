import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import {
  ItemService,
  PoolGroupError,
  MAX_GROUP_PHOTOS,
  type ReassignDest,
} from "@/server/services/ItemService";

// Unified "Move to…": reassigns selected photos to an existing item, a new item,
// or back to the pool. Auth mirrors the other pool routes: member-or-owner. The
// hero reconciliation and IDOR guard live in the service/repo; this handler
// validates input and maps PoolGroupError to a status code.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [collection, membership] = await Promise.all([
    new CollectionRepository(db).findById(params.id),
    new MembershipRepository(db).findByUser(session.user.id, params.id),
  ]);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!membership && collection.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const photoIds = (body as { photoIds?: unknown })?.photoIds;
  if (
    !Array.isArray(photoIds) ||
    photoIds.length === 0 ||
    !photoIds.every((x) => typeof x === "string")
  ) {
    return NextResponse.json({ error: "photoIds must be a non-empty string array" }, { status: 400 });
  }
  if (photoIds.length > MAX_GROUP_PHOTOS) {
    return NextResponse.json(
      { error: `photoIds must be at most ${MAX_GROUP_PHOTOS}` },
      { status: 400 },
    );
  }

  const d = (body as { destination?: any })?.destination;
  let dest: ReassignDest;
  if (d?.type === "item" && typeof d.itemId === "string") dest = { type: "item", itemId: d.itemId };
  else if (d?.type === "new") dest = { type: "new" };
  else if (d?.type === "pool") dest = { type: "pool" };
  else return NextResponse.json({ error: "Invalid destination" }, { status: 400 });

  try {
    const result = await new ItemService(
      new ItemRepository(db),
      new PhotoRepository(db),
    ).reassignPhotos(params.id, photoIds as string[], dest);
    return NextResponse.json({ number: result.number }, { status: 200 });
  } catch (error) {
    if (error instanceof PoolGroupError) {
      const status = error.code === "conflict" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
