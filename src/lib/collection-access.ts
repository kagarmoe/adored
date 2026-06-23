import { redirect } from "next/navigation";
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

/**
 * Resolve a collection the user may access, accepting EITHER its public slug OR
 * its raw ULID id (so old ULID links keep working). Tries the slug column first,
 * then the id column — disambiguation is at the DB-column level, never string
 * parsing. Returns null if it doesn't exist or the user is neither member nor
 * owner. No redirects: callers decide.
 */
export async function resolveCollection(
  db: Database,
  slugOrId: string,
  userId: string,
): Promise<Collection | null> {
  const repo = new CollectionRepository(db);
  const collection = (await repo.findBySlug(slugOrId)) ?? (await repo.findById(slugOrId));
  if (!collection) return null;
  const membership = await new MembershipRepository(db).findByUser(userId, collection.id);
  if (!membership && collection.ownerId !== userId) return null;
  return collection;
}

/** Load a collection the current user may access (member or owner). Redirects to
 *  /collections if it doesn't exist or the user has no access. The single guard
 *  for every collection-scoped page — call it right after the session check.
 *  `slugOrId` is whatever is in the URL (a slug, or a legacy ULID). */
export async function requireCollectionAccess(
  db: Database,
  slugOrId: string,
  userId: string,
): Promise<Collection> {
  const collection = await resolveCollection(db, slugOrId, userId);
  if (!collection) redirect("/collections");
  return collection;
}

/** Owner-only page guard. Resolves the collection (member-or-owner first),
 *  then enforces ownership. Non-owners (curators) are redirected to the
 *  collection detail page; absent/no-access collections redirect to /collections.
 *  `slugOrId` accepts slug or legacy ULID. */
export async function requireCollectionOwnerPage(
  db: Database,
  slugOrId: string,
  userId: string,
): Promise<Collection> {
  const collection = await requireCollectionAccess(db, slugOrId, userId);
  if (collection.ownerId !== userId) {
    redirect(`/collections/${collection.slug ?? collection.id}`);
  }
  return collection;
}
