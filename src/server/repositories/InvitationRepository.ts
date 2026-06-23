import type { Invitation } from "@/types";

export interface IInvitationRepository {
  create(data: {
    collectionId: string;
    email: string;
    token: string;
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
