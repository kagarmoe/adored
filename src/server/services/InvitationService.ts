import { randomBytes } from "crypto";
import type { Invitation } from "@/types";
import type { IInvitationRepository } from "@/server/repositories/InvitationRepository";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";

export type PermissionFlags = {
  canManageCollection: boolean;
  canInviteMembers: boolean;
  canAddItems: boolean;
  canEditMetadata: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canSort: boolean;
  canViewOutputs: boolean;
};

export class InvitationService {
  constructor(
    private invitationRepo: IInvitationRepository,
    private membershipRepo: IMembershipRepository,
  ) {}

  private generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  async createInvitation(
    collectionId: string,
    email: string,
    permissions: Partial<PermissionFlags>,
  ): Promise<Invitation> {
    const defaultPermissions: PermissionFlags = {
      canManageCollection: false,
      canInviteMembers: false,
      canAddItems: true,
      canEditMetadata: true,
      canAddPhotos: true,
      canDeletePhotos: false,
      canSort: true,
      canViewOutputs: true,
    };

    const token = this.generateToken();

    return this.invitationRepo.create({
      collectionId,
      email,
      token,
      ...defaultPermissions,
      ...permissions,
    });
  }

  async acceptInvitation(token: string, userId: string): Promise<void> {
    const invitation = await this.invitationRepo.findByToken(token);
    if (!invitation) {
      throw new Error("Invitation not found or expired");
    }

    if (invitation.status !== "pending") {
      throw new Error("Invitation has already been processed");
    }

    await this.membershipRepo.create({
      collectionId: invitation.collectionId,
      userId,
      canManageCollection: invitation.canManageCollection,
      canInviteMembers: invitation.canInviteMembers,
      canAddItems: invitation.canAddItems,
      canEditMetadata: invitation.canEditMetadata,
      canAddPhotos: invitation.canAddPhotos,
      canDeletePhotos: invitation.canDeletePhotos,
      canSort: invitation.canSort,
      canViewOutputs: invitation.canViewOutputs,
    });

    await this.invitationRepo.update(invitation.id, {
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async resendInvitation(id: string): Promise<Invitation> {
    const invitation = await this.invitationRepo.findById(id);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    const newToken = this.generateToken();

    return this.invitationRepo.update(id, {
      token: newToken,
      updatedAt: new Date(),
    });
  }

  async revokeInvitation(id: string): Promise<Invitation> {
    return this.invitationRepo.update(id, {
      status: "revoked",
      updatedAt: new Date(),
    });
  }
}
