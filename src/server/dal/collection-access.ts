// src/server/dal/collection-access.ts
// DAL capability chokepoint + resource wrappers (purses-89g).
// The three pre-existing guards (requireApiCollectionAccess, requireApiCollectionOwner,
// requireApiResultAccess) are re-expressed on the core with NO behavior change.
import { NextResponse } from "next/server";
import type { Database } from "@/lib/db";
import type { Collection, Item, Invitation, SortResult } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import {
  CAPABILITIES,
  resolveEffectiveRole,
  roleSatisfies,
} from "./capabilities";
import type { Operation } from "./capabilities";

// ─── Core capability gate ────────────────────────────────────────────────────

// Single authz chokepoint for all collection-scoped API routes.
// Resolves the collection (404 if absent), looks up the membership row, derives
// the effective role (null → 403), checks the capability (insufficient → 403),
// and returns the collection on success.
// Arg order (db, collectionId, userId, op) matches the resource wrappers below.
export async function requireApiCapability(
  db: Database,
  collectionId: string,
  userId: string,
  op: Operation,
): Promise<Collection | NextResponse> {
  const collection = await new CollectionRepository(db).findById(collectionId);
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await new MembershipRepository(db).findByUser(userId, collectionId);
  const role = resolveEffectiveRole(collection, membership, userId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const required = CAPABILITIES[op];
  if (!roleSatisfies(role, required)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return collection;
}

// ─── Resource wrappers ───────────────────────────────────────────────────────

// Resolve an item (including soft-deleted — needed for lifecycle/purge ops),
// then gate by capability. 404 if the item is absent.
export async function requireApiItemCapability(
  db: Database,
  itemId: string,
  userId: string,
  op: Operation,
): Promise<Item | NextResponse> {
  const item = await new ItemRepository(db).findByIdIncludingDeleted(itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireApiCapability(db, item.collectionId, userId, op);
  if (access instanceof NextResponse) return access;

  return item;
}

// Resolve an invitation, then gate by capability. 404 if the invitation is absent.
export async function requireApiInvitationCapability(
  db: Database,
  invitationId: string,
  userId: string,
  op: Operation,
): Promise<Invitation | NextResponse> {
  const invitation = await new InvitationRepository(db).findById(invitationId);
  if (!invitation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireApiCapability(db, invitation.collectionId, userId, op);
  if (access instanceof NextResponse) return access;

  return invitation;
}

// ─── Re-expressed existing guards (no behavior change) ───────────────────────

// Member-or-owner gate for collection-scoped API routes. ULID-only (params.id at
// the API layer is always a ULID — slugs are a nav concern). Returns the collection
// when the user may access it, else a NextResponse the caller returns immediately:
// 404 if the collection is absent, 403 if it exists but the user is neither member
// nor owner. Re-expressed as requireApiCapability("collection:read") — identical
// behavior: curator-level satisfies both members and owner.
export async function requireApiCollectionAccess(
  db: Database,
  collectionId: string,
  userId: string,
): Promise<Collection | NextResponse> {
  return requireApiCapability(db, collectionId, userId, "collection:read");
}

// Owner-only gate for collection-scoped API routes (a stricter sibling of
// requireApiCollectionAccess). Resolves the collection from its id, returns it
// iff the caller is the collection owner, else a NextResponse the caller returns
// immediately: 404 if absent, 403 if it exists but the caller is not the owner
// (a member-not-owner gets 403, same as a non-member). Used by destructive
// collection-owner ops (item purge) where membership is insufficient.
//
// Re-expression strategy: requireApiCapability("collection:manage") requires the
// "owner" role, which resolveEffectiveRole derives solely from collection.ownerId —
// so a curator (membership exists, ownerId != userId) gets 403 exactly as before.
// Behavior is identical: 404 absent, 403 exists-but-not-owner.
export async function requireApiCollectionOwner(
  db: Database,
  collectionId: string,
  userId: string,
): Promise<Collection | NextResponse> {
  return requireApiCapability(db, collectionId, userId, "collection:manage");
}

// Resolve a sort-result, then gate by collection access AND curator ownership
// (results are curator-scoped — each curator sorts independently, per t9l).
// Returns the result when the caller may act on it, else a NextResponse to return.
// UNCHANGED in behavior: collection access → curatorId===userId → 403.
export async function requireApiResultAccess(
  db: Database,
  resultId: string,
  userId: string,
): Promise<SortResult | NextResponse> {
  const result = await new SortResultRepository(db).findById(resultId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, result.collectionId, userId);
  if (access instanceof NextResponse) return access;
  if (result.curatorId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
