import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { requireApiInvitationCapability } from "@/server/dal/collection-access";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    // invitations:manage = owner — tightens from member-or-owner (PR1) to owner-only.
    const invitation = await requireApiInvitationCapability(db, params.id, user.id, "invitations:manage");
    if (invitation instanceof NextResponse) return invitation;

    const result = await InvitationController.fromDb(db).resendInvitation(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
