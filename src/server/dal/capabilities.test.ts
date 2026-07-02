// Unit tests for the DAL capability map + resolveEffectiveRole (purses-89g).
// TDD: these tests are written RED-first, before the implementation exists.
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  resolveEffectiveRole,
  roleSatisfies,
} from "./capabilities";
import type { Operation } from "./capabilities";

describe("resolveEffectiveRole", () => {
  it("returns 'owner' when userId matches ownerId — even with no membership row", () => {
    const collection = { ownerId: "user-1" };
    expect(resolveEffectiveRole(collection, null, "user-1")).toBe("owner");
  });

  it("returns 'owner' when userId matches ownerId — even when a membership row also exists", () => {
    const collection = { ownerId: "user-1" };
    const membership = { id: "mem-1" };
    expect(resolveEffectiveRole(collection, membership, "user-1")).toBe("owner");
  });

  it("returns 'curator' when userId does NOT match ownerId but a membership row exists", () => {
    const collection = { ownerId: "owner-user" };
    const membership = { id: "mem-1" };
    expect(resolveEffectiveRole(collection, membership, "curator-user")).toBe("curator");
  });

  it("returns null when userId does NOT match ownerId and no membership row", () => {
    const collection = { ownerId: "owner-user" };
    expect(resolveEffectiveRole(collection, null, "intruder")).toBeNull();
  });
});

describe("roleSatisfies", () => {
  it("owner satisfies 'owner'", () => {
    expect(roleSatisfies("owner", "owner")).toBe(true);
  });

  it("owner satisfies 'curator'", () => {
    expect(roleSatisfies("owner", "curator")).toBe(true);
  });

  it("curator satisfies 'curator'", () => {
    expect(roleSatisfies("curator", "curator")).toBe(true);
  });

  it("curator does NOT satisfy 'owner'", () => {
    expect(roleSatisfies("curator", "owner")).toBe(false);
  });
});

describe("CAPABILITIES map", () => {
  // Note: entry-per-Operation exhaustiveness is guaranteed at compile time by
  // the `Record<Operation, Role>` type on CAPABILITIES — no runtime test needed.
  // These assertions encode the POLICY VALUES (which role each op requires).
  it("curator-level operations resolve to 'curator'", () => {
    const curatorOps: Operation[] = [
      "collection:read",
      "members:read",
      "items:read",
      "items:write",
      "photos:write",
      "sessions:write",
      "preferences:write",
    ];
    for (const op of curatorOps) {
      expect(CAPABILITIES[op]).toBe("curator");
    }
  });

  it("owner-level operations resolve to 'owner'", () => {
    const ownerOps: Operation[] = [
      "invitations:read",
      "collection:manage",
      "collection:purge",
      "collection:audit",
      "members:manage",
      "invitations:manage",
      "items:purge",
    ];
    for (const op of ownerOps) {
      expect(CAPABILITIES[op]).toBe("owner");
    }
  });
});
