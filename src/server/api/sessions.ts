import { z } from "zod";
import type { Session } from "@/types";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { Database } from "@/lib/db";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

const CreateSessionSchema = z.object({
  goal: z.string().optional(),
});

const UpdateSessionSchema = z.object({
  status: z.enum(["active", "paused", "completed", "abandoned"]).optional(),
  goal: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;

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
}
