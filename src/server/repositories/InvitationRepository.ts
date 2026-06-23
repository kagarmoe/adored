import type { Invitation } from "@/types";

export interface IInvitationRepository {
  create(data: {
    collectionId: string;
    email: string;
    token: string;
    canManageCollection?: boolean;
    canInviteMembers?: boolean;
    canAddItems?: boolean;
    canEditMetadata?: boolean;
    canAddPhotos?: boolean;
    canDeletePhotos?: boolean;
    canSort?: boolean;
    canViewOutputs?: boolean;
  }): Promise<Invitation>;
  findById(id: string): Promise<Invitation | null>;
  findByToken(token: string): Promise<Invitation | null>;
  findByCollection(collectionId: string): Promise<Invitation[]>;
  findByEmail(email: string, collectionId: string): Promise<Invitation | null>;
  update(id: string, data: Partial<Invitation>): Promise<Invitation>;
  delete(id: string): Promise<void>;
  // Delete every invitation of the collection (direct collection_id). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
