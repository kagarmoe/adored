import type { Session } from "@/types";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

export class SessionService {
  constructor(private repo: ISessionRepository) {}

  async createSession(
    collectionId: string,
    curatorId: string,
    goal?: string,
  ): Promise<Session> {
    return this.repo.create({ collectionId, curatorId, goal });
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.repo.findById(sessionId);
  }

  async getActiveSession(collectionId: string, curatorId: string): Promise<Session | null> {
    return this.repo.findActive(collectionId, curatorId);
  }

  async getCollectionSessions(collectionId: string): Promise<Session[]> {
    return this.repo.findByCollection(collectionId);
  }

  async pauseSession(sessionId: string): Promise<Session> {
    return this.repo.update(sessionId, {
      status: "paused",
      updatedAt: new Date(),
    });
  }

  async resumeSession(sessionId: string): Promise<Session> {
    return this.repo.update(sessionId, {
      status: "active",
      updatedAt: new Date(),
    });
  }

  async completeSession(sessionId: string): Promise<Session> {
    return this.repo.update(sessionId, {
      status: "completed",
      updatedAt: new Date(),
    });
  }

  async abandonSession(sessionId: string): Promise<Session> {
    return this.repo.update(sessionId, {
      status: "abandoned",
      updatedAt: new Date(),
    });
  }
}
