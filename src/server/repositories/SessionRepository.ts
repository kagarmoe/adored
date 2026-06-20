import type { Session } from "@/types";

export interface ISessionRepository {
  create(data: {
    collectionId: string;
    curatorId: string;
    goal?: string;
  }): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findActive(collectionId: string, curatorId: string): Promise<Session | null>;
  findByCollection(collectionId: string): Promise<Session[]>;
  findByCollectionAndCurator(collectionId: string, curatorId: string): Promise<Session[]>;
  findByCollectionAndNumber(collectionId: string, number: number): Promise<Session | null>;
  update(id: string, data: Partial<Omit<Session, "id" | "createdAt">>): Promise<Session>;
  softDelete(id: string): Promise<Session>;
  // Delete every session of the collection (direct collection_id). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
