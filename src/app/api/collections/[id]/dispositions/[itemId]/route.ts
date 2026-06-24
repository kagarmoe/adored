import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { DispositionController } from "@/server/api/dispositions";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const item = await requireApiItemCapability(db, params.itemId, session.user.id, "preferences:write");
  if (item instanceof NextResponse) return item;
  if (item.collectionId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DispositionController.fromDb(db).bringBack(params.itemId, session.user.id); // idempotent → 200
  return NextResponse.json({ message: "Brought back" });
}
