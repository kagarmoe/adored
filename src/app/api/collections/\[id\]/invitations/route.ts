import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const invRepo = new InvitationRepository(db);
    const controller = new InvitationController(invRepo);
    const invitations = await controller.listInvitations(params.id);
    return NextResponse.json(invitations);
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
    await requireAuth();
    const body = await request.json();
    const db = getDb();
    const invRepo = new InvitationRepository(db);
    const controller = new InvitationController(invRepo);
    const invitation = await controller.createInvitation(params.id, body);
    return NextResponse.json(invitation, { status: 201 });
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
