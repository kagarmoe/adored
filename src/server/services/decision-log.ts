import type { DecisionEvent } from "@/types";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

// THE definition of "the curator's decision log" — the recompute and the round
// page provably read the same log (spec §2.6). Body is the former private
// PreferenceStateService.loadDecisionEvents, verbatim: the curator's non-deleted
// sessions' decision events, fetched once and in parallel
// (findByCollectionAndCurator yields the same session set the scorer scopes to).
export async function loadCuratorDecisionEvents(
  sessionRepo: SessionRepository,
  decisionRepo: DecisionEventRepository,
  collectionId: string,
  curatorId: string,
): Promise<DecisionEvent[]> {
  const sessions = await sessionRepo.findByCollectionAndCurator(collectionId, curatorId);
  const perSession = await Promise.all(
    sessions.map((s) => decisionRepo.findBySession(s.id)),
  );
  return perSession.flat();
}
