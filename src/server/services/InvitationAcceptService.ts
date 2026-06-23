import type { Database } from "@/lib/db";
import type { Invitation } from "@/types";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";
import { withTransaction } from "@/lib/transactions";
import { normalizeEmail } from "@/lib/normalize-email";

export class InvitationAcceptError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

export class InvitationAcceptService {
  constructor(private db: Database) {}

  static fromDb(db: Database): InvitationAcceptService {
    return new InvitationAcceptService(db);
  }

  /** Look up an invitation by token — for the GET (preview) path. */
  async findByToken(token: string): Promise<Invitation | null> {
    return new InvitationRepository(this.db).findByToken(token);
  }

  /** Accept an invitation: validate status + email, then atomically create membership + mark accepted. */
  async accept(token: string, userId: string): Promise<void> {
    const invRepo = new InvitationRepository(this.db);
    const invitation = await invRepo.findByToken(token);
    if (!invitation) {
      throw new InvitationAcceptError("Invitation not found or expired", 404);
    }
    if (invitation.status !== "pending") {
      throw new InvitationAcceptError("Invitation is no longer pending", 409);
    }

    const dbUser = await new UserRepository(this.db).findById(userId);
    if (!dbUser) {
      throw new InvitationAcceptError("User not found", 404);
    }
    if (!dbUser.email || normalizeEmail(dbUser.email) !== normalizeEmail(invitation.email)) {
      throw new InvitationAcceptError("This invitation is for a different account", 403);
    }

    await withTransaction(this.db, async (tx) => {
      await new MembershipRepository(tx).createIfAbsent({
        collectionId: invitation.collectionId,
        userId,
        role: "curator",
      });
      await new InvitationRepository(tx).update(invitation.id, {
        status: "accepted",
        acceptedAt: new Date(),
      });
    });
  }
}
