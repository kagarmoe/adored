import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import { ScoringService } from "@/server/services/ScoringService";

interface DecisionRequest {
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, unknown>;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Authorize BEFORE any write: the session must belong to a collection the user can access.
  const sessionRepo = new SessionRepository(db);
  const sortSession = await sessionRepo.findById(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const body: DecisionRequest = await req.json();
  try {
    const [event] = await db.insert(decisionEventsTable).values({
      id: generateId("event"),
      sessionId: params.id,
      type: body.type,
      decision: body.decision,
    }).returning();

    const decisionRepo = new DecisionEventRepository(db);
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const scoringService = new ScoringService(decisionRepo, sessionRepo);
    const prefService = new PreferenceStateService(prefRepo, scoringService);
    await prefService.recalculatePreferences(sortSession.collectionId, session.user.id);

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to record decision" }, { status: 500 });
  }
}
