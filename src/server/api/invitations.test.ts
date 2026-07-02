import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Invitation } from "@/types";
import type { IInvitationRepository } from "@/server/repositories/InvitationRepository";

// The email module is mocked so we assert the wiring (createInvitation /
// resendInvitation call sendInvitation with the invited address + the token)
// without any network I/O. The controller no longer builds the URL or touches
// env.AUTH_URL — sendInvitation owns the URL build — so no env mock is needed.
const sendInvitation = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({
  sendInvitation: (args: { to: string; token: string }) => sendInvitation(args),
}));

// Minimal in-memory repo — enough to drive create/find without a DB.
function makeRepo(seed: Invitation[] = []): IInvitationRepository {
  const store = new Map<string, Invitation>(seed.map((i) => [i.id, i]));
  let n = 0;
  return {
    async create({ collectionId, email, token }) {
      const inv: Invitation = {
        id: `inv_${++n}`,
        collectionId,
        email,
        token,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        acceptedAt: null,
      };
      store.set(inv.id, inv);
      return inv;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByToken(token) {
      return [...store.values()].find((i) => i.token === token) ?? null;
    },
    async findByCollection(collectionId) {
      return [...store.values()].filter((i) => i.collectionId === collectionId);
    },
    async findByEmail() {
      return null;
    },
    async update(id, data) {
      const cur = store.get(id)!;
      const next = { ...cur, ...data };
      store.set(id, next);
      return next;
    },
    async delete(id) {
      store.delete(id);
    },
    async deleteByCollection() {},
  };
}

let InvitationController: typeof import("./invitations").InvitationController;

beforeEach(async () => {
  vi.resetModules();
  sendInvitation.mockReset();
  sendInvitation.mockResolvedValue(undefined);
  ({ InvitationController } = await import("./invitations"));
});

describe("createInvitation — sends the invitation email", () => {
  it("emails the invited address with the created token", async () => {
    const repo = makeRepo();
    const controller = new InvitationController(repo);

    const result = await controller.createInvitation("col_1", { email: "Invitee@Example.com" });

    expect(sendInvitation).toHaveBeenCalledTimes(1);
    const arg = sendInvitation.mock.calls[0][0];
    // Sent ONLY to the invited (normalized) email — no other recipient.
    expect(arg.to).toBe("invitee@example.com");
    expect(arg.token).toBe(result.token);
    // Existing behavior preserved: token returned to the API caller.
    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThan(0);
  });

  it("passes only the recipient + token — no stray fields", async () => {
    const repo = makeRepo();
    const controller = new InvitationController(repo);

    const result = await controller.createInvitation("col_1", { email: "invitee@example.com" });

    const arg = sendInvitation.mock.calls[0][0];
    // Only two keys: to + token. The controller no longer builds a URL.
    expect(Object.keys(arg).sort()).toEqual(["to", "token"]);
    expect(arg.token).toBe(result.token);
  });
});

describe("resendInvitation — re-sends the existing invitation link", () => {
  it("looks up the invitation and emails its existing token URL", async () => {
    const existing: Invitation = {
      id: "inv_existing",
      collectionId: "col_1",
      email: "invitee@example.com",
      token: "EXISTING_TOKEN",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAt: null,
    };
    const repo = makeRepo([existing]);
    const controller = new InvitationController(repo);

    const result = await controller.resendInvitation("inv_existing");

    expect(sendInvitation).toHaveBeenCalledTimes(1);
    const arg = sendInvitation.mock.calls[0][0];
    expect(arg.to).toBe("invitee@example.com");
    expect(arg.token).toBe("EXISTING_TOKEN");
    // Still returns a confirmation message (no longer a bare stub) and does NOT
    // leak the token back to the client.
    expect(result.message).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain("EXISTING_TOKEN");
  });

  it("throws for a missing invitation without sending", async () => {
    const repo = makeRepo();
    const controller = new InvitationController(repo);

    await expect(controller.resendInvitation("nope")).rejects.toThrow(/not found/i);
    expect(sendInvitation).not.toHaveBeenCalled();
  });
});
