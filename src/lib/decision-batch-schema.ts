// Shared client/server batch schema (spec §2.1) — no server-only imports. The
// client pre-validates with this exact module, so the two sides can never
// drift. Regexes are the spec's, verbatim — lowercase Crockford base32 ULIDs,
// items carrying the repository's `item_` prefix.
import { z } from "zod";

export const ClientKey = z
  .string()
  .length(26)
  .regex(/^[0-9a-hjkmnp-tv-z]{26}$/);

export const ItemId = z
  .string()
  .max(64)
  .regex(/^item_[0-9a-hjkmnp-tv-z]{26}$/);

export const BatchEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("triage"),
    decision: z.object({
      itemId: ItemId,
      result: z.enum(["top", "high", "medium", "low"]),
    }),
    clientKey: ClientKey,
  }),
  z.object({
    type: z.literal("pairwise_compare"),
    decision: z.object({
      itemAId: ItemId,
      itemBId: ItemId,
      result: z.enum(["item_a", "item_b", "tie", "skip"]),
    }),
    clientKey: ClientKey,
  }),
  z.object({
    type: z.literal("usage"),
    decision: z.object({ itemId: ItemId, result: z.enum(["uses", "not_uses"]) }),
    clientKey: ClientKey,
  }),
]);

export const BatchRequestSchema = z.object({
  decisions: z.array(BatchEntrySchema).min(1).max(50),
});

export type BatchEntry = z.infer<typeof BatchEntrySchema>;
export type BatchResultStatus = "created" | "duplicate" | "rejected";
export interface BatchResult {
  clientKey: string;
  status: BatchResultStatus;
  reason?: "unknown_item";
}
export const MAX_BATCH_BYTES = 65_536;
