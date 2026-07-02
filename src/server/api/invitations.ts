import { z } from "zod";
import type { Invitation } from "@/types";
import type { IInvitationRepository } from "@/server/repositories/InvitationRepository";
import { randomBytes } from "crypto";
import { normalizeEmail } from "@/lib/normalize-email";
import type { Database } from "@/lib/db";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { sendInvitation } from "@/lib/email";

const CreateInvitationSchema = z.object({
  email: z.string().email(),
});

// Invitation flags are inert (DB-default only) and not mutable via PATCH — the
// repo update allow-list writes only status/acceptedAt. An empty schema keeps the
// member side and invitation side symmetric: an unknown flag key is stripped, not
// a 400. (Flag columns/fields are dropped in the deferred contract migration.)
const UpdateInvitationSchema = z.object({});


export class InvitationController {
  constructor(private invitationRepo: IInvitationRepository) {}

  static fromDb(db: Database): InvitationController {
    return new InvitationController(new InvitationRepository(db));
  }

  async listByCollection(collectionId: string): Promise<Invitation[]> {
    return this.invitationRepo.findByCollection(collectionId);
  }

  async listInvitations(): Promise<Invitation[]> {
    // TODO: Implement when InvitationRepository.findByCollection available
    return [];
  }

  async createInvitation(
    collectionId: string,
    data: unknown,
  ): Promise<Invitation & { token: string }> {
    const parsed = CreateInvitationSchema.parse(data);
    const email = normalizeEmail(parsed.email);
    const token = randomBytes(32).toString("hex");
    // Flags are not accepted from callers — DB column defaults govern all permissions.
    const invitation = await this.invitationRepo.create({
      collectionId,
      email,
      token,
    });
    await sendInvitation({ to: email, token });
    return { ...invitation, token };
  }

  async getInvitation(invitationId: string): Promise<Invitation> {
    const invitation = await this.invitationRepo.findById(invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }
    return invitation;
  }

  async updateInvitation(
    invitationId: string,
    data: unknown,
  ): Promise<Invitation> {
    const parsed = UpdateInvitationSchema.parse(data);
    return this.invitationRepo.update(invitationId, parsed);
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const invitation = await this.invitationRepo.findById(invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }
    await this.invitationRepo.update(invitationId, { status: "revoked" });
  }

  async resendInvitation(invitationId: string): Promise<{ message: string }> {
    const invitation = await this.invitationRepo.findById(invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }
    await sendInvitation({ to: invitation.email, token: invitation.token });
    return { message: "Invitation resent" };
  }

  async acceptInvitation(): Promise<{ message: string }> {
    // TODO: Find invitation by token, validate not expired, create membership
    // TODO: Update invitation status to accepted and set acceptedAt
    return { message: "Invitation accepted" };
  }
}
