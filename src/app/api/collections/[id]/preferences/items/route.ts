import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PreferenceController } from "@/server/api/preferences";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import { ScoringService } from "@/server/services/ScoringService";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;

    const prefRepo = new CollectionPreferenceItemRepository(db);
    const scoringService = new ScoringService(new DecisionEventRepository(db), new SessionRepository(db));
    const prefService = new PreferenceStateService(prefRepo, scoringService);
    const controller = new PreferenceController(prefService);
    const items = await controller.listItemPreferences(params.id, user.id);
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
