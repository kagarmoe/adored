import type { CollectionMembership } from "@/types";

export interface IMembershipRepository {
  create(data: {
    collectionId: string;
    userId: string;
    role?: "owner" | "curator";
    canManageCollection?: boolean;
    canInviteMembers?: boolean;
    canAddItems?: boolean;
    canDeleteItems?: boolean;
    canEditMetadata?: boolean;
    canAddPhotos?: boolean;
    canDeletePhotos?: boolean;
    canSort?: boolean;
    canViewOutputs?: boolean;
  }): Promise<CollectionMembership>;
  findById(id: string): Promise<CollectionMembership | null>;
  findByUser(userId: string, collectionId: string): Promise<CollectionMembership | null>;
  findByCollection(collectionId: string): Promise<CollectionMembership[]>;
  update(id: string, data: Partial<CollectionMembership>): Promise<CollectionMembership>;
  delete(id: string): Promise<void>;
  // Delete every membership of the collection (direct collection_id). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
