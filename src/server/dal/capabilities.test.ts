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

describe("CAPABILITIES map — policy VALUES pinned per operation (purses-j9qf Task 2)", () => {
  // `Record<Operation, Role>` guarantees an entry EXISTS for every op at compile
  // time — but not that it is CORRECT. A typo mapping `items:purge` → "curator"
  // compiles and passes the route-enumeration test (a curator legitimately 200s;
  // the stranger still 403s). This table pins the exact required role for every
  // operation so a wrong VALUE reddens CI.
  //
  // The table is the single source of expected values. The exhaustiveness guard
  // below asserts its key set equals Object.keys(CAPABILITIES) (which is exactly
  // the Operation union), so a newly-added Operation with no row here FAILS —
  // the new op forces a deliberate policy decision, not a silent default.
  const EXPECTED: Record<Operation, Role> = {
    // Owner-only: destructive / governance / invitee-visibility operations.
    "invitations:read": "owner",
    "collection:manage": "owner",
    "collection:purge": "owner",
    "collection:audit": "owner",
    "members:manage": "owner",
    "invitations:manage": "owner",
    "items:purge": "owner",
    // Curator-level: the day-to-day sorting/editing surface a member may use.
    "collection:read": "curator",
    "members:read": "curator",
    "items:read": "curator",
    "items:write": "curator",
    "photos:write": "curator",
    "sessions:write": "curator",
    "preferences:write": "curator",
  };

  it("EXPECTED covers EVERY operation and only real operations (drives newly-added ops to fail)", () => {
    // Object.keys(CAPABILITIES) is the runtime image of the Operation union.
    const actualOps = Object.keys(CAPABILITIES).sort();
    const assertedOps = Object.keys(EXPECTED).sort();
    // A new Operation added to the union (and thus to CAPABILITIES) but not to
    // EXPECTED → these sets diverge → FAIL, naming the gap.
    expect(assertedOps).toEqual(actualOps);
    // Guard against the count silently shrinking: 14 operations today.
    expect(actualOps).toHaveLength(14);
  });

  it.each(Object.keys(CAPABILITIES) as Operation[])(
    "CAPABILITIES[%s] equals the pinned required role",
    (op) => {
      expect(CAPABILITIES[op]).toBe(EXPECTED[op]);
    },
  );
});
