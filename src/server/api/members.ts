import { z } from "zod";
import type { CollectionMembership } from "@/types";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";

const CreateMemberSchema = z.object({
  userId: z.string(),
});

// No caller-supplied fields are accepted on update — role and flags are managed
// by the role model, not by raw client input.
const UpdateMemberSchema = z.object({});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;

export class MemberController {
  constructor(private membershipRepo: IMembershipRepository) {}

  async listMembers(collectionId: string): Promise<CollectionMembership[]> {
    return this.membershipRepo.findByCollection(collectionId);
  }

  async addMember(collectionId: string, data: unknown): Promise<CollectionMembership> {
    const parsed = CreateMemberSchema.parse(data);
    // New members always start as curator; flags use DB column defaults.
    return this.membershipRepo.create({
      collectionId,
      userId: parsed.userId,
      role: "curator",
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
}
