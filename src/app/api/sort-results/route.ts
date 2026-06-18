import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

interface CreateResultRequest {
  collectionId: string;
  name: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateResultRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getDb();
  const access = await requireApiCollectionAccess(db, body.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const result = await new SortResultRepository(db).create({
    collectionId: body.collectionId,
    curatorId: session.user.id,
    name: body.name,
    status: "draft",
  });
  return NextResponse.json(result, { status: 201 });
}
