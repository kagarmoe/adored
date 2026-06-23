import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";

interface DecisionRequest {
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, unknown>;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Authorize BEFORE any write: the session must belong to a collection the user can access.
  // getSessionOrNull distinguishes absent (→404) from a real DB error (→ propagates, 500).
  const sortSession = await SessionController.fromDb(db).getSessionOrNull(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  // purses-t9l: each user sorts independently — you may only record decisions in
  // your OWN session. Cross-curator triage is forbidden, blocked before any write.
  if (sortSession.curatorId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only record decisions in your own sorting session" },
      { status: 403 },
    );
  }

  const body: DecisionRequest = await req.json();
  try {
    const [event] = await db.insert(decisionEventsTable).values({
      id: generateId("event"),
      sessionId: params.id,
      type: body.type,
      decision: body.decision,
    }).returning();

    await PreferenceController.fromDb(db).recalculatePreferences(sortSession.collectionId, session.user.id);

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to record decision" }, { status: 500 });
  }
}
