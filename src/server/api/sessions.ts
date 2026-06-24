import { z } from "zod";
import type { Session } from "@/types";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { Database } from "@/lib/db";
import {
  SessionRepository,
  CurrentSessionExistsError,
} from "@/server/repositories/implementations/SessionRepository";

const CreateSessionSchema = z.object({
  goal: z.string().optional(),
});

const UpdateSessionSchema = z.object({
  status: z.enum(["active", "paused", "completed", "abandoned"]).optional(),
  goal: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;

// Defined in the repository (where the unique-violation is caught) to keep the
// api -> repo dependency direction clean; re-exported here for route callers
// (and used directly by restoreSession's friendly pre-check below).
export { CurrentSessionExistsError };

export class SessionController {
  constructor(private sessionRepo: ISessionRepository) {}

  static fromDb(db: Database): SessionController {
    return new SessionController(new SessionRepository(db));
  }

  async createSession(
    collectionId: string,
    curatorId: string,
    data: unknown,
  ): Promise<Session> {
    const parsed = CreateSessionSchema.parse(data);
    return this.sessionRepo.create({
      collectionId,
      curatorId,
      goal: parsed.goal,
    });
  }

  // Returns null for an absent session so the caller maps it to 404 WITHOUT
  // swallowing a real DB/infra error (a thrown getter caught blanketly would
  // collapse an outage into 404). Mirrors ItemController.getItem. (The old
  // throwing getSession was dropped — every caller migrated to this null getter.)
  async getSessionOrNull(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.findById(sessionId);
  }

  // Like getSessionOrNull but reaches set-aside (soft-deleted) sessions too, so
  // the undo path can confirm a session exists before restoring it. Returns null
  // for an absent session (-> 404) without swallowing real DB/infra errors.
  async getSessionIncludingDeletedOrNull(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.findByIdIncludingDeleted(sessionId);
  }

  async listByCollectionAndCurator(collectionId: string, curatorId: string): Promise<Session[]> {
    return this.sessionRepo.findByCollectionAndCurator(collectionId, curatorId);
  }

  async getByCollectionAndNumber(collectionId: string, number: number): Promise<Session | null> {
    return this.sessionRepo.findByCollectionAndNumber(collectionId, number);
  }

  async updateSession(sessionId: string, data: unknown): Promise<Session> {
    const parsed = UpdateSessionSchema.parse(data);
    return this.sessionRepo.update(sessionId, parsed);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepo.softDelete(sessionId);
  }

  // Undo "set aside" — re-activate a soft-deleted session. After migration 0009
  // the partial index frees the slot on set-aside, so a NEWER in-progress
  // session may already hold it; re-activating this one would put two
  // in-progress sessions in the slot. The friendly pre-check rejects that with a
  // gentle 409 BEFORE the UPDATE; the repo's restore() catch is the race
  // backstop if a session is created between this read and the UPDATE.
  async restoreSession(sessionId: string): Promise<Session> {
    const target = await this.sessionRepo.findByIdIncludingDeleted(sessionId);
    if (target) {
      const inProgress = await this.sessionRepo.findInProgress(
        target.collectionId,
        target.curatorId,
      );
      if (inProgress && inProgress.id !== sessionId) {
        throw new CurrentSessionExistsError();
      }
    }
    return this.sessionRepo.restore(sessionId);
  }
}
