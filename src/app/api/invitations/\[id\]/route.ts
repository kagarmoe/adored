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
    const invitation = await controller.getInvitation(params.id);
    return NextResponse.json(invitation);
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
    const invRepo = new InvitationRepository(db);
    const controller = new InvitationController(invRepo);
    const invitation = await controller.updateInvitation(params.id, body);
    return NextResponse.json(invitation);
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
    const invRepo = new InvitationRepository(db);
    const controller = new InvitationController(invRepo);
    await controller.revokeInvitation(params.id);
    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
