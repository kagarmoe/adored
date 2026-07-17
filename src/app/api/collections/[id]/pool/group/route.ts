import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCapability } from "@/server/dal/collection-access";
import { ItemService, MAX_GROUP_PHOTOS } from "@/server/services/ItemService";
import { POOL_CAP_MESSAGE } from "@/lib/pool-limits";
import { errorResponse } from "@/server/api/http-errors";

// Groups selected pooled photos into one new (nameless, catalog-numbered) item.
// photos:write = curator (full-curator model).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // photos:write = curator — any curator may group pool photos (full-curator model).
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
      { error: POOL_CAP_MESSAGE },
      { status: 400 },
    );
  }

  // mode is lenient: "each" makes one item per photo; anything else falls back to "combine".
  const mode = (body as { mode?: unknown })?.mode === "each" ? "each" : "combine";

  const service = ItemService.fromDb(db);
  try {
    if (mode === "each") {
      const items = await service.createItemsFromPoolEach(id, photoIds as string[]);
      return NextResponse.json({ count: items.length }, { status: 201 });
    }
    const item = await service.createItemFromPool(id, photoIds as string[]);
    return NextResponse.json({ number: item.number }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
