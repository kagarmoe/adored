import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import { ScoringService } from "@/server/services/ScoringService";

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

  try {
    // Record the decision
    const [event] = await db.insert(decisionEventsTable).values({
      id: generateId("event"),
      sessionId: params.id,
      type: body.type,
      decision: body.decision,
    }).returning();

    // Recalculate preferences for the collection
    const sessionRepo = new SessionRepository(db);
    const sortSession = await sessionRepo.findById(params.id);

    if (sortSession) {
      const decisionRepo = new DecisionEventRepository(db);
      const prefRepo = new CollectionPreferenceItemRepository(db);
      const scoringService = new ScoringService(decisionRepo, sessionRepo);
      const prefService = new PreferenceStateService(prefRepo, scoringService);

      await prefService.recalculatePreferences(sortSession.collectionId, session.user.id);
    }

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record decision" },
      { status: 500 }
    );
  }
}
