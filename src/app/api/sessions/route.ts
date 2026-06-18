import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const newSession = await new SessionRepository(db).create({
    collectionId,
    curatorId: session.user.id,
    goal,
  });
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

  const sessions = await new SessionRepository(db).findByCollectionAndCurator(collectionId, session.user.id);
  return NextResponse.json(sessions);
}
