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
    await requireAuth();
    const db = getDb();
    const sessionRepo = new SessionRepository(db);
    const controller = new SessionController(sessionRepo);

    const sessions = await controller.listSessions(params.id);
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const sessionRepo = new SessionRepository(db);
    const controller = new SessionController(sessionRepo);

    const session = await controller.createSession(params.id, user.id, body);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
