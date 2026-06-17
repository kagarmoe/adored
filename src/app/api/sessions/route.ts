import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const [newSession] = await db.insert(sessionsTable).values({
    id: generateId("session"),
    collectionId,
    curatorId: session.user.id,
    goal,
    status: "active",
  }).returning();
  return NextResponse.json(newSession, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const collectionId = new URL(req.url).searchParams.get("collectionId");
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
  return NextResponse.json(sessions);
}
