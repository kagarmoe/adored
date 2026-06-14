import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

// Lists a collection's pooled (unassigned) photos as JSON. The bulk uploader
// polls this after uploading: the durable rows are written by Blob's async
// completion callback, which lands a beat after upload() resolves, so the
// client waits here until the new rows appear before refreshing the view.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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

  const pool = await new PhotoRepository(db).findPoolByCollection(params.id);
  return NextResponse.json({
    photos: pool.map((p) => ({ id: p.id, filename: p.filename })),
  });
}
