import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { decisionEventsTable, itemsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { withTransaction, lockCollectionCurator } from "@/lib/transactions";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DispositionController } from "@/server/api/dispositions";

// The recompute-under-lock write path uses node-postgres — pin the Node runtime
// (not Edge) and give the platform an explicit, generous function cap so a slow
// recompute can't be aborted mid-transaction and roll back (and lose) the tap.
export const runtime = "nodejs";
export const maxDuration = 30;

// sxfo: validate the request body at the boundary with a discriminated union on
// `type`, so a malformed shape (out-of-enum type, missing/typo'd decision field)
// is rejected with 400 BEFORE the transaction — it can never flow to the scorer
// (score.toString() on undefined) or persist a garbage decision_events row.
// bucket_assign is reserved (no scorer consumer yet); it still gets a real shape
// so the discriminator stays exhaustive.
const DecisionRequestSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("triage"),
      decision: z.object({
        itemId: z.string().min(1),
        result: z.enum(["top", "high", "medium", "low"]),
      }),
    }),
    z.object({
      type: z.literal("pairwise_compare"),
      decision: z.object({
        itemAId: z.string().min(1),
        itemBId: z.string().min(1),
        result: z.enum(["item_a", "item_b", "tie", "skip"]),
      }),
    }),
    z.object({
      type: z.literal("bucket_assign"),
      decision: z.object({
        itemId: z.string().min(1),
        bucket: z.enum(["top", "high", "medium", "low"]),
      }),
    }),
    z.object({
      type: z.literal("usage"),
      decision: z.object({
        itemId: z.string().min(1),
        result: z.enum(["uses", "not_uses"]),
      }),
    }),
  ])
  .and(z.object({ clientKey: z.string().min(1).optional() }));

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Capture once: the `session.user` narrowing above is lost inside the tx closure.
  const userId = session.user.id;

  const db = getDb();
  // Authorize BEFORE any write: the session must belong to a collection the user can access.
  // getSessionOrNull distinguishes absent (→404) from a real DB error (→ propagates, 500).
  const sortSession = await SessionController.fromDb(db).getSessionOrNull(id);
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
  // completed/abandoned/soft-deleted session is terminal; reject a late tap with
  // 409 so it can't mutate a finished session's preference set.
  if (sortSession.status !== "active" && sortSession.status !== "paused") {
    return NextResponse.json(
      { error: "This sorting session is no longer in progress" },
      { status: 409 },
    );
  }

  // sxfo: malformed JSON and an out-of-contract shape are the client's fault →
  // 400 (API.md's contract), parsed BEFORE the transaction so junk never persists.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = DecisionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;
  const clientKey = body.clientKey;

  // purses-stln: the decision must reference a LIVE item in THIS session's
  // collection — the same semantic check the batch route already makes
  // (referencesUnknownItem + liveItemIds). Without it a foreign/nonexistent/
  // deleted itemId flows to the insert + recompute, planting a cross-collection
  // preference row, and triage's bringBack would clear a disposition unscoped by
  // collection. ONE indexed query for the collection's live item ids; reject the
  // WHOLE request with 400 (the route's bad-input signal) BEFORE any write —
  // EITHER side of a compare pair must be live.
  const liveRows = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(
      and(
        eq(itemsTable.collectionId, sortSession.collectionId),
        isNull(itemsTable.deletedAt),
      ),
    );
  const liveItemIds = new Set(liveRows.map((r) => r.id));
  const referencesUnknownItem =
    body.type === "pairwise_compare"
      ? !liveItemIds.has(body.decision.itemAId) || !liveItemIds.has(body.decision.itemBId)
      : !liveItemIds.has(body.decision.itemId);
  if (referencesUnknownItem) {
    return NextResponse.json(
      { error: "Decision references an item not in this collection" },
      { status: 400 },
    );
  }

  try {
    // Atomic: the event insert, preference recalc, and (for triage) the
    // disposition clear must all commit or all roll back. A partial failure
    // would otherwise leave an item BOTH ranked and disposed, breaking the
    // disposed <=> untriaged invariant. Every write uses the tx-bound handle.
    const { event, isNew } = await withTransaction(db, async (tx) => {
      // (op/ctx passed below label the slow-op + error telemetry at the seam.)
      // duv4: serialize ALL of this curator's preference recomputes for this
      // collection. recalculatePreferences rewrites the whole (collection,curator)
      // set from EVERY session, so a per-session FOR UPDATE was too narrow — two
      // POSTs to DIFFERENT sessions of one curator locked different rows and could
      // recompute concurrently, losing a tap. The shared (collection,curator)
      // advisory lock — taken by setDisposition too — serializes all of them and
      // still guards the idempotency read/insert below against a concurrent recompute.
      await lockCollectionCurator(tx, sortSession.collectionId, userId);

      // Idempotency: if this clientKey already recorded an event, return it
      // unchanged — skip the insert, recompute, and disposition clear.
      const findByClientKey = async () =>
        clientKey
          ? await tx
              .select()
              .from(decisionEventsTable)
              .where(
                and(
                  eq(decisionEventsTable.sessionId, id),
                  eq(decisionEventsTable.clientKey, clientKey),
                ),
              )
              .limit(1)
          : [];

      const existing = await findByClientKey();
      if (existing.length > 0) return { event: existing[0], isNew: false };

      // No 23505 catch here: the advisory lock above serializes all writers for
      // this (collection, curator), so the SELECT-first check is authoritative
      // and the insert can never race an identical clientKey. (The old
      // catch-and-re-read was dead AND broken — a re-read inside the aborted
      // transaction would die with 25P02. Spec §2.5.)
      const [inserted] = await tx.insert(decisionEventsTable).values({
        id: generateId("event"),
        sessionId: id,
        type: body.type,
        decision: body.decision,
        clientKey,
      }).returning();

      // Parent D3: usage NEVER recomputes. The recompute output would be
      // identical anyway (the scorer ignores unknown types), but it still clears
      // every orderRank + bulk-upserts the whole (collection,curator) set — pure
      // waste inside the advisory lock. Skip it for usage.
      if (body.type !== "usage") {
        await PreferenceController.fromDb(tx).recalculatePreferences(sortSession.collectionId, userId);
      }

      // disposed <=> untriaged: triaging an item clears any prior disposition for
      // this curator, so a previously set_aside/deferred item can't be both at once.
      if (body.type === "triage") {
        await DispositionController.fromDb(tx).bringBack(body.decision.itemId, userId);
      }

      return { event: inserted, isNew: true };
    }, {
      op: "record_decision",
      ctx: { collectionId: sortSession.collectionId, curatorId: userId, sessionId: id },
    });

    return NextResponse.json(event, { status: isNew ? 201 : 200 });
  } catch (error) {
    // The failure is already observed at the withTransaction seam: it's called
    // with op:"record_decision" + this exact {collectionId, curatorId, sessionId}
    // ctx, so its catch logs [db_error] ONCE and rethrows. Logging again here
    // double-counted every failure — so this catch
    // only maps the error to a 500 and never re-logs.
    // Never echo the error: it carries driver text (relation/constraint names,
    // sometimes values) — purses-hiez.
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}
