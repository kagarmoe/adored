import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { withTransaction } from "@/lib/transactions";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DispositionController } from "@/server/api/dispositions";

interface DecisionRequest {
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, unknown>;
  clientKey?: string;
}

// A Postgres unique-violation surfaces its code at .code or, when wrapped by the
// driver/drizzle, at .cause.code. Check both so the idempotent retry catches it.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Capture once: the `session.user` narrowing above is lost inside the tx closure.
  const userId = session.user.id;

  const db = getDb();
  // Authorize BEFORE any write: the session must belong to a collection the user can access.
  // getSessionOrNull distinguishes absent (→404) from a real DB error (→ propagates, 500).
  const sortSession = await SessionController.fromDb(db).getSessionOrNull(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, userId);
  if (access instanceof NextResponse) return access;

  // purses-t9l: each user sorts independently — you may only record decisions in
  // your OWN session. Cross-curator triage is forbidden, blocked before any write.
  if (sortSession.curatorId !== userId) {
    return NextResponse.json(
      { error: "You can only record decisions in your own sorting session" },
      { status: 403 },
    );
  }

  const body: DecisionRequest = await req.json();
  const clientKey = body.clientKey;
  try {
    // Atomic: the event insert, preference recalc, and (for triage) the
    // disposition clear must all commit or all roll back. A partial failure
    // would otherwise leave an item BOTH ranked and disposed, breaking the
    // disposed <=> untriaged invariant. Every write uses the tx-bound handle.
    const { event, isNew } = await withTransaction(db, async (tx) => {
      // Serialize a curator's concurrent decisions: the row-lock makes two
      // in-flight POSTs for this session queue behind each other, so the
      // idempotency read/insert below can't race the recompute. The per-session
      // lock is sufficient (not a per-curator lock) because of the single-active-
      // session-per-(collection,curator) invariant: a curator has at most one
      // active session per collection, so concurrent recomputes for the same
      // (collection, curator) can't arise from two different sessions.
      await tx.execute(sql`select id from sessions where id = ${params.id} for update`);

      // Idempotency: if this clientKey already recorded an event, return it
      // unchanged — skip the insert, recompute, and disposition clear.
      const findByClientKey = async () =>
        clientKey
          ? await tx
              .select()
              .from(decisionEventsTable)
              .where(
                and(
                  eq(decisionEventsTable.sessionId, params.id),
                  eq(decisionEventsTable.clientKey, clientKey),
                ),
              )
              .limit(1)
          : [];

      const existing = await findByClientKey();
      if (existing.length > 0) return { event: existing[0], isNew: false };

      let inserted: typeof decisionEventsTable.$inferSelect | undefined;
      try {
        [inserted] = await tx.insert(decisionEventsTable).values({
          id: generateId("event"),
          sessionId: params.id,
          type: body.type,
          decision: body.decision,
          clientKey,
        }).returning();
      } catch (error) {
        // Race: another identical request inserted the same (session, clientKey)
        // between our SELECT and INSERT. The partial unique index rejects it;
        // re-read and return that row idempotently instead of 500-ing.
        if (clientKey && isUniqueViolation(error)) {
          const raced = await findByClientKey();
          if (raced.length > 0) return { event: raced[0], isNew: false };
        }
        throw error;
      }

      await PreferenceController.fromDb(tx).recalculatePreferences(sortSession.collectionId, userId);

      // disposed <=> untriaged: triaging an item clears any prior disposition for
      // this curator, so a previously set_aside/deferred item can't be both at once.
      if (body.type === "triage") {
        const itemId = (body.decision as { itemId?: string }).itemId;
        if (itemId) await DispositionController.fromDb(tx).bringBack(itemId, userId);
      }

      return { event: inserted, isNew: true };
    });

    return NextResponse.json(event, { status: isNew ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to record decision" }, { status: 500 });
  }
}
