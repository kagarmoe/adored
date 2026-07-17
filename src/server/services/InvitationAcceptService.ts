import type { Database } from "@/lib/db";
import type { Invitation, InvitationStatus } from "@/types";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
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

/**
 * The GET preview payload — deliberately narrower than the raw `Invitation` row.
 * No token echo (the caller already holds it) and no ids: only what the
 * emailed recipient already legitimately sees or needs (spec Global
 * Constraints, purses-puuj.3).
 */
export interface InvitationPreview {
  collectionName: string;
  collectionDescription: string | null;
  inviterName: string | null;
  invitedEmail: string;
  status: InvitationStatus;
}

export class InvitationAcceptService {
  constructor(private db: Database) {}

  static fromDb(db: Database): InvitationAcceptService {
    return new InvitationAcceptService(db);
  }

  /** Look up an invitation by token — internal (accept()) and the raw-row callers. */
  async findByToken(token: string): Promise<Invitation | null> {
    return new InvitationRepository(this.db).findByToken(token);
  }

  /**
   * Shaped preview for the GET (public) path: joins the collection and its
   * owner (= inviter — only owners can invite) server-side, so the caller
   * never sees the raw row, the token, or any id. Returns null on a bad/
   * expired token OR a collection that no longer exists — either way there's
   * nothing to preview, and the route maps null to 404 either way.
   */
  async getPreview(token: string): Promise<InvitationPreview | null> {
    const invitation = await this.findByToken(token);
    if (!invitation) return null;

    const collection = await new CollectionRepository(this.db).findById(invitation.collectionId);
    if (!collection) return null;

    const owner = await new UserRepository(this.db).findById(collection.ownerId);

    return {
      collectionName: collection.name,
      collectionDescription: collection.description,
      // Never an email — a display name only, and only if one exists.
      inviterName: owner?.name ?? null,
      invitedEmail: invitation.email,
      status: invitation.status,
    };
  }

  /** Accept an invitation: validate status + email, then atomically create membership + mark accepted. */
  async accept(token: string, userId: string): Promise<{ collectionId: string }> {
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

    return { collectionId: invitation.collectionId };
  }
}
