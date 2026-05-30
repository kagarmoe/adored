import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  const db = getDb();

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

  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get("collectionId");
  
  if (!collectionId) {
    return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  }

  const db = getDb();
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
  return NextResponse.json(sessions);
}
