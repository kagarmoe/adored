import { describe, it, expect, beforeEach, vi } from "vitest";
import { InvitationService } from "@/server/services/InvitationService";
import type { IInvitationRepository } from "@/server/repositories/InvitationRepository";
import type { IMembershipRepository } from "@/server/repositories/MembershipRepository";
import type { Invitation } from "@/types";

describe("InvitationService", () => {
  let invitationRepo: IInvitationRepository;
  let membershipRepo: IMembershipRepository;
  let service: InvitationService;

  const mockInvitation = (overrides?: Partial<Invitation>): Invitation => ({
    id: "inv-1",
    collectionId: "coll-1",
    email: "user@example.com",
    token: "token123",
    canManageCollection: false,
    canInviteMembers: false,
    canAddItems: true,
    canEditMetadata: true,
    canAddPhotos: true,
    canDeletePhotos: false,
    canSort: true,
    canViewOutputs: true,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    acceptedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    invitationRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByCollection: vi.fn(),
      findByEmail: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    membershipRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByUser: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    service = new InvitationService(invitationRepo, membershipRepo);
  });

  describe("createInvitation", () => {
    it("creates invitation with token", async () => {
      const mockInv = mockInvitation();
      vi.mocked(invitationRepo.create).mockResolvedValueOnce(mockInv);

      await service.createInvitation("coll-1", "user@example.com", {});

      expect(invitationRepo.create).toHaveBeenCalled();
      const call = vi.mocked(invitationRepo.create).mock.calls[0][0];
      expect(call.collectionId).toBe("coll-1");
      expect(call.email).toBe("user@example.com");
      expect(call.token).toBeTruthy();
      expect(call.token.length).toBeGreaterThan(0);
    });

    it("applies custom permissions", async () => {
      vi.mocked(invitationRepo.create).mockResolvedValueOnce(
        mockInvitation({ canManageCollection: true }),
      );

      await service.createInvitation("coll-1", "user@example.com", {
        canManageCollection: true,
        canAddPhotos: false,
      });

      const call = vi.mocked(invitationRepo.create).mock.calls[0][0];
      expect(call.canManageCollection).toBe(true);
      expect(call.canAddPhotos).toBe(false);
    });
  });

  describe("acceptInvitation", () => {
    it("converts invitation to membership", async () => {
      const mockInv = mockInvitation({
        id: "inv-1",
        token: "valid-token",
        status: "pending",
      });

      vi.mocked(invitationRepo.findByToken).mockResolvedValueOnce(mockInv);
      vi.mocked(invitationRepo.update).mockResolvedValueOnce(
        mockInvitation({ status: "accepted" }),
      );

      await service.acceptInvitation("valid-token", "user-123");

      expect(membershipRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionId: "coll-1",
          userId: "user-123",
          canAddItems: true,
        }),
      );
      expect(invitationRepo.update).toHaveBeenCalledWith(
        "inv-1",
        expect.objectContaining({
          status: "accepted",
        }),
      );
    });

    it("throws for invalid token", async () => {
      vi.mocked(invitationRepo.findByToken).mockResolvedValueOnce(null);

      await expect(
        service.acceptInvitation("invalid-token", "user-123"),
      ).rejects.toThrow("Invitation not found");
    });

    it("throws for already accepted invitation", async () => {
      vi.mocked(invitationRepo.findByToken).mockResolvedValueOnce(
        mockInvitation({ status: "accepted" }),
      );

      await expect(
        service.acceptInvitation("token", "user-123"),
      ).rejects.toThrow("already been processed");
    });
  });

  describe("resendInvitation", () => {
    it("generates new token", async () => {
      const mockInv = mockInvitation({ id: "inv-1" });
      vi.mocked(invitationRepo.findById).mockResolvedValueOnce(mockInv);
      vi.mocked(invitationRepo.update).mockResolvedValueOnce(
        mockInvitation({ token: "new-token" }),
      );

      await service.resendInvitation("inv-1");

      const call = vi.mocked(invitationRepo.update).mock.calls[0];
      expect(call[0]).toBe("inv-1");
      expect(call[1].token).toBeTruthy();
      expect(call[1].token).not.toBe("token123");
    });
  });

  describe("revokeInvitation", () => {
    it("marks invitation as revoked", async () => {
      vi.mocked(invitationRepo.update).mockResolvedValueOnce(
        mockInvitation({ status: "revoked" }),
      );

      const result = await service.revokeInvitation("inv-1");

      expect(result.status).toBe("revoked");
    });
  });
});
