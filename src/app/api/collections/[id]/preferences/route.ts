import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PreferenceController } from "@/server/api/preferences";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import { ScoringService } from "@/server/services/ScoringService";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const decisionRepo = new DecisionEventRepository(db);
    const sessionRepo = new SessionRepository(db);
    const scoringService = new ScoringService(decisionRepo, sessionRepo);
    const prefService = new PreferenceStateService(prefRepo, scoringService);
    const controller = new PreferenceController(prefRepo, prefService);
    const summary = await controller.getPreferenceSummary(params.id, user.id);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const decisionRepo = new DecisionEventRepository(db);
    const sessionRepo = new SessionRepository(db);
    const scoringService = new ScoringService(decisionRepo, sessionRepo);
    const prefService = new PreferenceStateService(prefRepo, scoringService);
    const controller = new PreferenceController(prefRepo, prefService);
    await controller.clearPreferences(params.id, user.id);
    return NextResponse.json({ message: "Preferences cleared" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
