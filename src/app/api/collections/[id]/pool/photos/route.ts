import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoController } from "@/server/api/photos";
import { requireApiCapability } from "@/server/dal/collection-access";

// Lists a collection's pooled (unassigned) photos as JSON.
// items:read = curator (full-curator model).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // items:read = curator — any curator may list pool photos (full-curator model).
  const access = await requireApiCapability(db, params.id, session.user.id, "items:read");
  if (access instanceof NextResponse) return access;

  const pool = await PhotoController.fromDb(db).findPoolByCollection(params.id);
  return NextResponse.json({
    photos: pool.map((p) => ({ id: p.id, filename: p.filename })),
  });
}
