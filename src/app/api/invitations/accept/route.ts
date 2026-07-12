import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InvitationAcceptService } from "@/server/services/InvitationAcceptService";
import { getPostHogClient } from "@/lib/posthog-server";
import { errorResponse } from "@/server/api/http-errors";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const invitation = await InvitationAcceptService.fromDb(db).findByToken(token);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(invitation);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Token check first — cheap early return for malformed URLs (no auth cost).
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Require session — POST accept must know who is accepting.
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await InvitationAcceptService.fromDb(db).accept(token, userId);
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: userId,
      event: 'invitation_accepted',
    });
    await phClient.flush();
    return NextResponse.json({ message: "Invitation accepted successfully" });
  } catch (error) {
    // errorResponse passes InvitationAcceptError's curated copy + status through,
    // and logs+hides anything internal.
    return errorResponse(error);
  }
}
