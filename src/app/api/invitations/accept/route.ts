import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";
import { withTransaction } from "@/lib/transactions";
import { normalizeEmail } from "@/lib/normalize-email";

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
    const invRepo = new InvitationRepository(db);
    const invitation = await invRepo.findByToken(token);

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
    const invRepo = new InvitationRepository(db);
    const invitation = await invRepo.findByToken(token);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 }
      );
    }

    // Status guard — only pending invitations may be accepted.
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Invitation is no longer pending" },
        { status: 409 }
      );
    }

    // Identity guard — the session user's email must match the invitation email.
    const userRepo = new UserRepository(db);
    const dbUser = await userRepo.findById(userId);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    // user.email is nullable in the schema (the User type overstates it). A user
    // with no email can never match an invitation — clean 403, not a 500 on trim.
    if (!dbUser.email || normalizeEmail(dbUser.email) !== normalizeEmail(invitation.email)) {
      return NextResponse.json(
        { error: "This invitation is for a different account" },
        { status: 403 }
      );
    }

    // Atomic: insert curator membership + mark invitation accepted.
    await withTransaction(db, async (tx) => {
      const txMembershipRepo = new MembershipRepository(tx);
      const txInvRepo = new InvitationRepository(tx);

      // Idempotency arbiter: the (collection_id, user_id) unique index. createIfAbsent
      // uses onConflictDoNothing, so a duplicate raises NO error and does not poison
      // the transaction — the invitation update + commit still land.
      await txMembershipRepo.createIfAbsent({
        collectionId: invitation.collectionId,
        userId,
        role: "curator",
      });

      await txInvRepo.update(invitation.id, {
        status: "accepted",
        acceptedAt: new Date(),
      });
    });

    return NextResponse.json({ message: "Invitation accepted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
