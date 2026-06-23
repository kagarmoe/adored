import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const newSession = await SessionController.fromDb(db).createSession(collectionId, session.user.id, { goal });
  return NextResponse.json(newSession, { status: 201 });
}
