import { z } from "zod";
import type { Invitation } from "@/types";
import type { IInvitationRepository } from "@/server/repositories/InvitationRepository";
import { generateId } from "@/lib/id";
import { randomBytes } from "crypto";

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  canManageCollection: z.boolean().optional().default(false),
  canInviteMembers: z.boolean().optional().default(false),
  canAddItems: z.boolean().optional().default(false),
  canEditMetadata: z.boolean().optional().default(false),
  canAddPhotos: z.boolean().optional().default(false),
  canDeletePhotos: z.boolean().optional().default(false),
  canSort: z.boolean().optional().default(false),
  canViewOutputs: z.boolean().optional().default(false),
});

const UpdateInvitationSchema = z.object({
  canManageCollection: z.boolean().optional(),
  canInviteMembers: z.boolean().optional(),
  canAddItems: z.boolean().optional(),
  canEditMetadata: z.boolean().optional(),
  canAddPhotos: z.boolean().optional(),
  canDeletePhotos: z.boolean().optional(),
  canSort: z.boolean().optional(),
  canViewOutputs: z.boolean().optional(),
});

const AcceptInvitationSchema = z.object({
  token: z.string(),
});

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;
export type UpdateInvitationInput = z.infer<typeof UpdateInvitationSchema>;

export class InvitationController {
  constructor(private invitationRepo: IInvitationRepository) {}

  async listInvitations(collectionId: string): Promise<Invitation[]> {
    // TODO: Implement when InvitationRepository.findByCollection available
    return [];
  }

  async createInvitation(
    collectionId: string,
    data: unknown,
  ): Promise<Invitation & { token: string }> {
    const parsed = CreateInvitationSchema.parse(data);
    const token = randomBytes(32).toString("hex");
    const invitation = await this.invitationRepo.create({
      collectionId,
      email: parsed.email,
      token,
      canManageCollection: parsed.canManageCollection,
      canInviteMembers: parsed.canInviteMembers,
      canAddItems: parsed.canAddItems,
      canEditMetadata: parsed.canEditMetadata,
      canAddPhotos: parsed.canAddPhotos,
      canDeletePhotos: parsed.canDeletePhotos,
      canSort: parsed.canSort,
      canViewOutputs: parsed.canViewOutputs,
    });
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
    // TODO: Send invitation email with token
    return { message: "Invitation resent" };
  }

  async acceptInvitation(token: string, userId: string): Promise<{ message: string }> {
    // TODO: Find invitation by token, validate not expired, create membership
    // TODO: Update invitation status to accepted and set acceptedAt
    return { message: "Invitation accepted" };
  }
}
