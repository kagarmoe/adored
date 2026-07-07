import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { decisionEventsTable, itemsTable } from "@/lib/db/schema";
import { generateOrderedIdFactory } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { withTransaction, lockCollectionCurator } from "@/lib/transactions";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DispositionController } from "@/server/api/dispositions";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  BatchRequestSchema,
  MAX_BATCH_BYTES,
  type BatchEntry,
  type BatchResult,
} from "@/lib/decision-batch-schema";
import { readJsonWithLimit, BodyTooLargeError } from "@/lib/read-json-with-limit";

// The recompute-under-lock write path uses node-postgres — pin the Node runtime
// (not Edge) and give the platform an explicit, generous function cap so a slow
// recompute can't be aborted mid-transaction and roll back (and lose) the batch.
export const runtime = "nodejs";
export const maxDuration = 30;

// Semantic validation (spec §2.3.2): an entry referencing an item outside the
// collection's live set — EITHER side of a compare pair — is rejected, never
// written. Closes, for the batch route, the gap the single route still has
// (purses-stln).
function referencesUnknownItem(entry: BatchEntry, liveItemIds: Set<string>): boolean {
  if (entry.type === "triage") return !liveItemIds.has(entry.decision.itemId);
  return (
    !liveItemIds.has(entry.decision.itemAId) || !liveItemIds.has(entry.decision.itemBId)
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Capture once: the `session.user` narrowing above is lost inside the tx closure.
  const userId = session.user.id;

  const db = getDb();
  // Authorize BEFORE any read of the body: the session must belong to a
  // collection the user can access. getSessionOrNull distinguishes absent
  // (→404) from a real DB error (→ propagates, 500).
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

  // duv4: a decision may only be recorded on an IN-PROGRESS session (active or
  // paused — the states the partial unique index treats as holding the slot). A
  // completed/abandoned/soft-deleted session is terminal; reject a late batch
  // with 409 so it can't mutate a finished session's preference set.
  if (sortSession.status !== "active" && sortSession.status !== "paused") {
    return NextResponse.json(
      { error: "This sorting session is no longer in progress" },
      { status: 409 },
    );
  }

  // Body cap is STREAM-enforced (spec F17): App Router has no
  // bodyParser.sizeLimit and Content-Length is absent under chunked transfer,
  // so the reader budgets bytes as they arrive and cancels the stream the
  // moment the budget is exceeded — 413. Malformed JSON under budget → 400.
  let raw: unknown;
  try {
    raw = await readJsonWithLimit(req, MAX_BATCH_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }

  // sxfo: whole-batch boundary validation with the shared client/server schema
  // — one out-of-contract entry rejects the whole batch with 400 BEFORE the
  // transaction, so junk never persists (the client pre-validates with the
  // same module, so a 400 here means a stale/foreign caller).
  const parsed = BatchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Atomic: all entry inserts, the single preference recompute, and the
    // triage disposition clears commit or roll back together — a partial batch
    // would leave items both ranked and disposed. Every write uses the
    // tx-bound handle.
    const results = await withTransaction(db, async (tx) => {
      // §2.3.1 — duv4: the SAME (collection,curator) advisory lock the single
      // decisions route and setDisposition take — serializes every preference
      // recompute for this curator so batches, single taps, and dispositions
      // can never interleave.
      await lockCollectionCurator(tx, sortSession.collectionId, userId);

      const entries = parsed.data.decisions;

      // §2.3.2 — semantic validation: ONE indexed query for the collection's
      // live item ids; every entry is classified against the set in memory.
      const liveRows = await tx
        .select({ id: itemsTable.id })
        .from(itemsTable)
        .where(
          and(
            eq(itemsTable.collectionId, sortSession.collectionId),
            isNull(itemsTable.deletedAt),
          ),
        );
      const liveItemIds = new Set(liveRows.map((r) => r.id));

      // §2.3.3 — cross-request idempotency: ONE SELECT of the batch's keys that
      // already committed for this session. The advisory lock serializes all
      // writers, so this read is authoritative.
      const existingRows = await tx
        .select({ clientKey: decisionEventsTable.clientKey })
        .from(decisionEventsTable)
        .where(
          and(
            eq(decisionEventsTable.sessionId, params.id),
            inArray(
              decisionEventsTable.clientKey,
              entries.map((e) => e.clientKey),
            ),
          ),
        );
      const committedKeys = new Set(existingRows.map((r) => r.clientKey));

      // §2.3.4/5 — classify in array order; insert survivors with monotonic
      // ids (later array entries get strictly greater ids, so at the shared
      // transaction timestamp the (createdAt, id) comparator resolves in-batch
      // same-item conflicts to the later entry).
      const nextId = generateOrderedIdFactory();
      const seenKeys = new Set<string>();
      const insertedTriagedItemIds = new Set<string>();
      let insertedCount = 0;
      const results: BatchResult[] = [];

      for (const entry of entries) {
        if (referencesUnknownItem(entry, liveItemIds)) {
          results.push({ clientKey: entry.clientKey, status: "rejected", reason: "unknown_item" });
          continue;
        }
        if (committedKeys.has(entry.clientKey) || seenKeys.has(entry.clientKey)) {
          // In-batch dedupe: first occurrence proceeds, later ones are
          // duplicates — same semantics as a replay.
          results.push({ clientKey: entry.clientKey, status: "duplicate" });
          continue;
        }
        seenKeys.add(entry.clientKey);
        // Defense-in-depth: ON CONFLICT on the partial unique index — NEVER a
        // mid-transaction re-read, which would die with 25P02 inside an
        // aborted transaction. An absent RETURNING row → duplicate.
        const inserted = await tx
          .insert(decisionEventsTable)
          .values({
            id: nextId(),
            sessionId: params.id,
            type: entry.type,
            decision: entry.decision,
            clientKey: entry.clientKey,
            // createdAt OMITTED — defaultNow(): one shared timestamp per
            // batch, same clock domain as the single route (spec §2.3.5).
          })
          .onConflictDoNothing({
            target: [decisionEventsTable.sessionId, decisionEventsTable.clientKey],
            where: sql`${decisionEventsTable.clientKey} is not null`,
          })
          .returning({ id: decisionEventsTable.id });
        if (inserted.length === 0) {
          results.push({ clientKey: entry.clientKey, status: "duplicate" });
          continue;
        }
        insertedCount++;
        if (entry.type === "triage") insertedTriagedItemIds.add(entry.decision.itemId);
        results.push({ clientKey: entry.clientKey, status: "created" });
      }

      // §2.3.6 — ONE recompute, only if ≥1 row was inserted: an all-duplicate/
      // rejected batch (e.g. the recovery gate replaying a batch whose ack was
      // lost after commit) must not rewrite the preference set.
      if (insertedCount > 0) {
        await PreferenceController.fromDb(tx).recalculatePreferences(
          sortSession.collectionId,
          userId,
        );

        // §2.3.7 — disposed <=> untriaged: clear once per distinct triaged
        // item among the INSERTED entries only — never for duplicate/rejected.
        for (const itemId of insertedTriagedItemIds) {
          await DispositionController.fromDb(tx).bringBack(itemId, userId);
        }
      }

      return results;
    }, {
      op: "record_decision_batch",
      ctx: { collectionId: sortSession.collectionId, curatorId: userId, sessionId: params.id },
    });

    // ONE capture per request — including all-duplicate replays: replay
    // frequency is exactly the recovery-path signal worth observing. Counts
    // only, never ids (PII discipline).
    const counts = { created: 0, duplicate: 0, rejected: 0 };
    for (const r of results) counts[r.status]++;
    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: userId,
      event: "sort_decision_batch_recorded",
      properties: counts,
    });
    // flush (NOT shutdown): deliver before the function returns — serverless
    // can freeze the instance the moment we respond.
    await phClient.flush();

    return NextResponse.json({ results }, { status: counts.created > 0 ? 201 : 200 });
  } catch (error) {
    // The failure is already observed at the withTransaction seam (op:
    // "record_decision_batch" + ctx), which logs [db_error] + emits
    // db_action_failed ONCE and rethrows — this catch only maps to a 500 and
    // never re-logs.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record decisions" },
      { status: 500 },
    );
  }
}
