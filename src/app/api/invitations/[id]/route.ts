import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { requireApiInvitationCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // invitations:read = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, id, user.id, "invitations:read");
    if (invitation instanceof NextResponse) return invitation;
    return NextResponse.json(invitation);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // invitations:manage = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, id, user.id, "invitations:manage");
    if (invitation instanceof NextResponse) return invitation;

    const body = await request.json();
    const updated = await InvitationController.fromDb(db).updateInvitation(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    // invitations:manage = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, id, user.id, "invitations:manage");
    if (invitation instanceof NextResponse) return invitation;

    await InvitationController.fromDb(db).revokeInvitation(id);
    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}
