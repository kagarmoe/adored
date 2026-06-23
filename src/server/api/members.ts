import { z } from "zod";
import type { CollectionMembership } from "@/types";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";
import type { Database } from "@/lib/db";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const CreateMemberSchema = z.object({
  userId: z.string(),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;

export class MemberController {
  constructor(private membershipRepo: IMembershipRepository) {}

  static fromDb(db: Database): MemberController {
    return new MemberController(new MembershipRepository(db));
  }

  async getByIdForCollection(membershipId: string, collectionId: string): Promise<CollectionMembership | null> {
    const row = await this.membershipRepo.findById(membershipId);
    return row && row.collectionId === collectionId ? row : null;
  }

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

  // updateMember removed (purses-2wzz): PATCH /members/[mid] had no UI caller and
  // members have no editable fields under the role model.

  async removeMember(membershipId: string): Promise<void> {
    const membership = await this.membershipRepo.findById(membershipId);
    if (!membership) {
      throw new Error("Membership not found");
    }
    await this.membershipRepo.delete(membershipId);
  }

  async addOwner(collectionId: string, userId: string): Promise<CollectionMembership> {
    return this.membershipRepo.create({ collectionId, userId, role: "owner" });
  }
}
