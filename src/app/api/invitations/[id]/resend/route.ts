import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";

export async function POST(
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

    const controller = new InvitationController(invRepo);
    const result = await controller.resendInvitation(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
