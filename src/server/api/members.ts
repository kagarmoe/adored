import { z } from "zod";
import type { CollectionMembership } from "@/types";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";
import type { ICollectionRepository } from "@/server/repositories/CollectionRepository";

const CreateMemberSchema = z.object({
  userId: z.string(),
  canManageCollection: z.boolean().optional().default(false),
  canInviteMembers: z.boolean().optional().default(false),
  canAddItems: z.boolean().optional().default(false),
  canEditMetadata: z.boolean().optional().default(false),
  canAddPhotos: z.boolean().optional().default(false),
  canDeletePhotos: z.boolean().optional().default(false),
  canSort: z.boolean().optional().default(false),
  canViewOutputs: z.boolean().optional().default(false),
});

const UpdateMemberSchema = z.object({
  canManageCollection: z.boolean().optional(),
  canInviteMembers: z.boolean().optional(),
  canAddItems: z.boolean().optional(),
  canEditMetadata: z.boolean().optional(),
  canAddPhotos: z.boolean().optional(),
  canDeletePhotos: z.boolean().optional(),
  canSort: z.boolean().optional(),
  canViewOutputs: z.boolean().optional(),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;

export class MemberController {
  constructor(
    private membershipRepo: IMembershipRepository,
    private collectionRepo: ICollectionRepository,
  ) {}

  async listMembers(collectionId: string): Promise<CollectionMembership[]> {
    return this.membershipRepo.findByCollection(collectionId);
  }

  async addMember(collectionId: string, data: unknown): Promise<CollectionMembership> {
    const parsed = CreateMemberSchema.parse(data);
    return this.membershipRepo.create({
      collectionId,
      userId: parsed.userId,
      canManageCollection: parsed.canManageCollection,
      canInviteMembers: parsed.canInviteMembers,
      canAddItems: parsed.canAddItems,
      canEditMetadata: parsed.canEditMetadata,
      canAddPhotos: parsed.canAddPhotos,
      canDeletePhotos: parsed.canDeletePhotos,
      canSort: parsed.canSort,
      canViewOutputs: parsed.canViewOutputs,
    });
  }

  async getMember(membershipId: string): Promise<CollectionMembership> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) {
      throw new Error("Membership not found");
    }
    return membership;
  }

  async updateMember(membershipId: string, data: unknown): Promise<CollectionMembership> {
    const parsed = UpdateMemberSchema.parse(data);
    return this.membershipRepo.update(membershipId, parsed);
  }

  async removeMember(membershipId: string): Promise<void> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) {
      throw new Error("Membership not found");
    }
    await this.membershipRepo.delete(membershipId);
  }

  async isCollectionManager(collectionId: string, userId: string): Promise<boolean> {
    // TODO: Check if user is collection manager
    const collection = await this.collectionRepo.findById(collectionId);
    if (!collection) return false;
    return collection.ownerId === userId;
  }
}
