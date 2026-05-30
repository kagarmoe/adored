import { NextRequest, NextResponse } from "next/server";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const db = getDb();
    const invRepo = new InvitationRepository(db);
    const invitation = await invRepo.findByToken(params.token);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(invitation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const db = getDb();
    const invRepo = new InvitationRepository(db);
    const invitation = await invRepo.findByToken(params.token);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 }
      );
    }

    // Mark invitation as accepted and create membership
    await invRepo.update(invitation.id, {
      status: "accepted",
    });

    return NextResponse.json({ message: "Invitation accepted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
