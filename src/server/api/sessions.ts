import { z } from "zod";
import type { Session } from "@/types";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

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

  async getSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    return session;
  }

  async updateSession(sessionId: string, data: unknown): Promise<Session> {
    const parsed = UpdateSessionSchema.parse(data);
    return this.sessionRepo.update(sessionId, parsed);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepo.softDelete(sessionId);
  }
}
