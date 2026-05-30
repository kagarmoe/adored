import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";

interface DecisionRequest {
  sessionId: string;
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, any>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: DecisionRequest = await req.json();
  const db = getDb();

  const [event] = await db.insert(decisionEventsTable).values({
    id: generateId("event"),
    sessionId: params.id,
    type: body.type,
    decision: body.decision,
  }).returning();

  return NextResponse.json(event, { status: 201 });
}
