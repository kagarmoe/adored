import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";

interface CreateResultRequest {
  sessionId: string;
  collectionId: string;
  name: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: CreateResultRequest = await req.json();
  const db = getDb();

  const [result] = await db.insert(sortResultsTable).values({
    id: generateId("result"),
    collectionId: body.collectionId,
    curatorId: session.user.id,
    status: "draft",
    name: body.name,
  }).returning();

  return NextResponse.json(result, { status: 201 });
}
