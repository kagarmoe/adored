import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const invRepo = new InvitationRepository(db);

    const invitation = await invRepo.findById(params.id);
    if (!invitation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, invitation.collectionId, user.id);
    if (access instanceof NextResponse) return access;

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
    const invRepo = new InvitationRepository(db);

    const existing = await invRepo.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, existing.collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const controller = new InvitationController(invRepo);
    const invitation = await controller.updateInvitation(params.id, body);
    return NextResponse.json(invitation);
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
    const invRepo = new InvitationRepository(db);

    const existing = await invRepo.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await requireApiCollectionAccess(db, existing.collectionId, user.id);
    if (access instanceof NextResponse) return access;

    const controller = new InvitationController(invRepo);
    await controller.revokeInvitation(params.id);
    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}
