import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { ItemService, PoolGroupError, MAX_GROUP_PHOTOS } from "@/server/services/ItemService";

// Groups selected pooled photos into one new (nameless, catalog-numbered) item.
// photos:write = curator (full-curator model).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // photos:write = curator — any curator may group pool photos (full-curator model).
  const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
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

  // mode is lenient: "each" makes one item per photo; anything else falls back to "combine".
  const mode = (body as { mode?: unknown })?.mode === "each" ? "each" : "combine";

  const service = new ItemService(new ItemRepository(db), new PhotoRepository(db));
  try {
    if (mode === "each") {
      const items = await service.createItemsFromPoolEach(params.id, photoIds as string[]);
      return NextResponse.json({ count: items.length }, { status: 201 });
    }
    const item = await service.createItemFromPool(params.id, photoIds as string[]);
    return NextResponse.json({ number: item.number }, { status: 201 });
  } catch (error) {
    if (error instanceof PoolGroupError) {
      const status = error.code === "conflict" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
