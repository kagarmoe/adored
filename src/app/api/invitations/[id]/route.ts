import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { requireApiInvitationCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // invitations:read = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, params.id, user.id, "invitations:read");
    if (invitation instanceof NextResponse) return invitation;
    return NextResponse.json(invitation);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // invitations:manage = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, params.id, user.id, "invitations:manage");
    if (invitation instanceof NextResponse) return invitation;

    const body = await request.json();
    const controller = new InvitationController(new InvitationRepository(db));
    const updated = await controller.updateInvitation(params.id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // invitations:manage = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, params.id, user.id, "invitations:manage");
    if (invitation instanceof NextResponse) return invitation;

    const controller = new InvitationController(new InvitationRepository(db));
    await controller.revokeInvitation(params.id);
    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}
