import { describe, it, expect, beforeEach, vi } from "vitest";
import { MembershipService } from "@/server/services/MembershipService";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";
import type { CollectionMembership } from "@/types";

describe("MembershipService", () => {
  let membershipRepo: IMembershipRepository;
  let service: MembershipService;

  const mockMembership = (overrides?: Partial<CollectionMembership>): CollectionMembership => ({
    id: "mem-1",
    collectionId: "coll-1",
    userId: "user-1",
    role: "curator",
    name: "Test User",
    canManageCollection: false,
    canInviteMembers: false,
    canAddItems: true,
    canEditMetadata: true,
    canAddPhotos: true,
    canDeletePhotos: false,
    canDeleteItems: false,
    canSort: true,
    canViewOutputs: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    membershipRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByUser: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    service = new MembershipService(membershipRepo);
  });

  describe("addMember", () => {
    it("adds new member with permissions", async () => {
      vi.mocked(membershipRepo.findByUser).mockResolvedValueOnce(null);
      vi.mocked(membershipRepo.create).mockResolvedValueOnce(
        mockMembership({ userId: "user-1" }),
      );

      const result = await service.addMember("coll-1", "user-1", { canSort: false });

      expect(membershipRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionId: "coll-1",
          userId: "user-1",
          canSort: false,
          canAddItems: true,
        }),
      );
      expect(result.userId).toBe("user-1");
    });

    it("throws if user already member", async () => {
      vi.mocked(membershipRepo.findByUser).mockResolvedValueOnce(mockMembership());

      await expect(
        service.addMember("coll-1", "user-1", {}),
      ).rejects.toThrow("already a member");
    });
  });

  describe("getMember", () => {
    it("returns member details", async () => {
      const member = mockMembership();
      vi.mocked(membershipRepo.findByUser).mockResolvedValueOnce(member);

      const result = await service.getMember("user-1", "coll-1");

      expect(result).toEqual(member);
    });
  });

  describe("getCollectionMembers", () => {
    it("returns all members of collection", async () => {
      const members = [
        mockMembership({ userId: "user-1" }),
        mockMembership({ userId: "user-2", id: "mem-2" }),
      ];

      vi.mocked(membershipRepo.findByCollection).mockResolvedValueOnce(members);

      const result = await service.getCollectionMembers("coll-1");

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe("user-1");
    });
  });

  describe("updateMemberPermissions", () => {
    it("updates permissions", async () => {
      const updated = mockMembership({ canSort: false });
      vi.mocked(membershipRepo.update).mockResolvedValueOnce(updated);

      const result = await service.updateMemberPermissions("mem-1", { canSort: false });

      expect(membershipRepo.update).toHaveBeenCalledWith("mem-1", {
        canSort: false,
        updatedAt: expect.any(Date),
      });
      expect(result.canSort).toBe(false);
    });
  });

  describe("removeMember", () => {
    it("deletes membership", async () => {
      await service.removeMember("mem-1");

      expect(membershipRepo.delete).toHaveBeenCalledWith("mem-1");
    });
  });

  describe("checkPermission", () => {
    it("returns true for granted permission", async () => {
      vi.mocked(membershipRepo.findById).mockResolvedValueOnce(
        mockMembership({ canSort: true }),
      );

      const result = await service.checkPermission("mem-1", "canSort");

      expect(result).toBe(true);
    });

    it("returns false for denied permission", async () => {
      vi.mocked(membershipRepo.findById).mockResolvedValueOnce(
        mockMembership({ canSort: false }),
      );

      const result = await service.checkPermission("mem-1", "canSort");

      expect(result).toBe(false);
    });

    it("returns false for nonexistent membership", async () => {
      vi.mocked(membershipRepo.findById).mockResolvedValueOnce(null);

      const result = await service.checkPermission("nonexistent", "canSort");

      expect(result).toBe(false);
    });
  });
});
