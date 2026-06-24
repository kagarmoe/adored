import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability, requireApiCollectionAccess } from "@/server/dal/collection-access";
import { DispositionController, PreferenceExistsError } from "@/server/api/dispositions";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { itemId?: string; disposition?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const db = getDb();
  // Resolve the item, authorize on its collection, then assert it agrees with the URL.
  const item = await requireApiItemCapability(db, body.itemId, session.user.id, "preferences:write");
  if (item instanceof NextResponse) return item;
  if (item.collectionId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await DispositionController.fromDb(db).setDisposition(params.id, session.user.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PreferenceExistsError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Failed to set disposition" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const disp = new URL(req.url).searchParams.get("disposition") ?? undefined;
  const list = await DispositionController.fromDb(db).listDispositions(
    params.id, session.user.id, disp === "set_aside" || disp === "deferred" ? disp : undefined,
  );
  return NextResponse.json(list);
}
