import type { CollectionMembership } from "@/types";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";
import type { PermissionFlags } from "@/server/services/InvitationService";

export class MembershipService {
  constructor(private membershipRepo: IMembershipRepository) {}

  async addMember(
    collectionId: string,
    userId: string,
    permissions: Partial<PermissionFlags>,
  ): Promise<CollectionMembership> {
    const existing = await this.membershipRepo.findByUser(userId, collectionId);
    if (existing) {
      throw new Error("User is already a member of this collection");
    }

    const defaultPermissions = {
      canManageCollection: false,
      canInviteMembers: false,
      canAddItems: true,
      canEditMetadata: true,
      canAddPhotos: true,
      canDeletePhotos: false,
      canSort: true,
      canViewOutputs: true,
    };

    return this.membershipRepo.create({
      collectionId,
      userId,
      ...defaultPermissions,
      ...permissions,
    });
  }

  async getMember(
    userId: string,
    collectionId: string,
  ): Promise<CollectionMembership | null> {
    return this.membershipRepo.findByUser(userId, collectionId);
  }

  async getCollectionMembers(collectionId: string): Promise<CollectionMembership[]> {
    return this.membershipRepo.findByCollection(collectionId);
  }

  async updateMemberPermissions(
    membershipId: string,
    permissions: Partial<PermissionFlags>,
  ): Promise<CollectionMembership> {
    return this.membershipRepo.update(membershipId, {
      ...permissions,
      updatedAt: new Date(),
    });
  }

  async removeMember(membershipId: string): Promise<void> {
    await this.membershipRepo.delete(membershipId);
  }

  async checkPermission(
    membershipId: string,
    permission: keyof PermissionFlags,
  ): Promise<boolean> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) return false;

    return membership[permission] ?? false;
  }
}
