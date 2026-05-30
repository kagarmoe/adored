import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { InvitationController } from "@/server/api/invitations";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { getDb } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const db = getDb();
    const invRepo = new InvitationRepository(db);
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
