import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { SessionController } from "@/server/api/sessions";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const sessionRepo = new SessionRepository(db);
    const controller = new SessionController(sessionRepo);

    const session = await controller.getActiveSession(params.id, user.id);
    if (!session) {
      return NextResponse.json(null);
    }
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
