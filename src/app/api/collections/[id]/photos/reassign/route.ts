import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import {
  ItemService,
  MAX_GROUP_PHOTOS,
  type ReassignDest,
} from "@/server/services/ItemService";
import { errorResponse } from "@/server/api/http-errors";

// Unified "Move to…": reassigns selected photos to an existing item, a new item,
// or back to the pool. photos:write = curator (full-curator model).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // photos:write = curator — any curator may reassign photos (full-curator model).
  const access = await requireApiCapability(db, id, session.user.id, "photos:write");
  if (access instanceof NextResponse) return access;

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
    const result = await ItemService.fromDb(db).reassignPhotos(id, photoIds as string[], dest);
    return NextResponse.json({ number: result.number }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
