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

    const session = await controller.getSession(params.id);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const db = getDb();
    const sessionRepo = new SessionRepository(db);
    const controller = new SessionController(sessionRepo);

    const session = await controller.updateSession(params.id, body);
    return NextResponse.json(session);
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const sessionRepo = new SessionRepository(db);
    const controller = new SessionController(sessionRepo);

    await controller.deleteSession(params.id);
    return NextResponse.json({ message: "Session deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
