import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { generateId } from "./id";
import {
  ClientKey,
  ItemId,
  BatchEntrySchema,
  BatchRequestSchema,
  MAX_BATCH_BYTES,
} from "./decision-batch-schema";

describe("ItemId", () => {
  it("accepts a real repository-format id (F1 end-to-end id-format pin)", () => {
    expect(ItemId.safeParse(generateId("item")).success).toBe(true);
  });
  it("rejects a bare 26-char ULID (no prefix)", () => {
    expect(ItemId.safeParse(ulid().toLowerCase()).success).toBe(false);
  });
  it("rejects an uppercase ITEM_ id", () => {
    expect(ItemId.safeParse(`ITEM_${ulid()}`).success).toBe(false);
  });
  it("rejects a 65-char id", () => {
    const long = `item_${"0".repeat(60)}`;
    expect(long).toHaveLength(65);
    expect(ItemId.safeParse(long).success).toBe(false);
  });
});

describe("ClientKey", () => {
  it("accepts ulid().toLowerCase()", () => {
    expect(ClientKey.safeParse(ulid().toLowerCase()).success).toBe(true);
  });
  it("rejects an uppercase ULID", () => {
    expect(ClientKey.safeParse(ulid()).success).toBe(false);
  });
  it("rejects 25 and 27 char strings", () => {
    const key = ulid().toLowerCase();
    expect(ClientKey.safeParse(key.slice(0, 25)).success).toBe(false);
    expect(ClientKey.safeParse(`${key}0`).success).toBe(false);
  });
  it("rejects chars outside Crockford base32 (i, l, o, u)", () => {
    const key = ulid().toLowerCase();
    for (const bad of ["i", "l", "o", "u"]) {
      expect(ClientKey.safeParse(`${bad}${key.slice(1)}`).success).toBe(false);
    }
  });
});

describe("BatchEntrySchema", () => {
  it("accepts a triage entry and a pairwise_compare entry", () => {
    expect(
      BatchEntrySchema.safeParse({
        type: "triage",
        decision: { itemId: generateId("item"), result: "top" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(true);
    expect(
      BatchEntrySchema.safeParse({
        type: "pairwise_compare",
        decision: { itemAId: generateId("item"), itemBId: generateId("item"), result: "tie" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(true);
  });
  it("rejects a bad enum result and a missing clientKey", () => {
    expect(
      BatchEntrySchema.safeParse({
        type: "triage",
        decision: { itemId: generateId("item"), result: "loved" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(false);
    expect(
      BatchEntrySchema.safeParse({
        type: "triage",
        decision: { itemId: generateId("item"), result: "top" },
      }).success,
    ).toBe(false);
  });
});

describe("BatchEntrySchema — usage variant (Epic R dark)", () => {
  it("accepts a usage entry with repo-format itemId and lowercase ULID clientKey", () => {
    expect(
      BatchEntrySchema.safeParse({
        type: "usage",
        decision: { itemId: generateId("item"), result: "uses" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(true);
    expect(
      BatchEntrySchema.safeParse({
        type: "usage",
        decision: { itemId: generateId("item"), result: "not_uses" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(true);
  });
  it("rejects a bare 26-char ULID itemId (no item_ prefix — F1 drift guard)", () => {
    expect(
      BatchEntrySchema.safeParse({
        type: "usage",
        decision: { itemId: ulid().toLowerCase(), result: "uses" },
        clientKey: ulid().toLowerCase(),
      }).success,
    ).toBe(false);
  });
  it("rejects out-of-enum usage results", () => {
    for (const bad of ["sometimes", "skip", "yes"]) {
      expect(
        BatchEntrySchema.safeParse({
          type: "usage",
          decision: { itemId: generateId("item"), result: bad },
          clientKey: ulid().toLowerCase(),
        }).success,
      ).toBe(false);
    }
  });
});

describe("BatchRequestSchema", () => {
  const triageEntry = () => ({
    type: "triage" as const,
    decision: { itemId: generateId("item"), result: "high" as const },
    clientKey: ulid().toLowerCase(),
  });
  const compareEntry = () => ({
    type: "pairwise_compare" as const,
    decision: {
      itemAId: generateId("item"),
      itemBId: generateId("item"),
      result: "item_a" as const,
    },
    clientKey: ulid().toLowerCase(),
  });
  const usageEntry = () => ({
    type: "usage" as const,
    decision: { itemId: generateId("item"), result: "uses" as const },
    clientKey: ulid().toLowerCase(),
  });

  it("rejects an empty decisions array (min 1)", () => {
    expect(BatchRequestSchema.safeParse({ decisions: [] }).success).toBe(false);
  });
  it("rejects 51 entries (max 50)", () => {
    const decisions = Array.from({ length: 51 }, () => triageEntry());
    expect(BatchRequestSchema.safeParse({ decisions }).success).toBe(false);
  });
  it("accepts a mixed 50-entry triage+compare batch built from repo-format ids and lowercase ULID keys", () => {
    const decisions = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? triageEntry() : compareEntry(),
    );
    expect(BatchRequestSchema.safeParse({ decisions }).success).toBe(true);
  });
  it("accepts a mixed triage+pairwise_compare+usage batch (Epic R dark)", () => {
    const decisions = [triageEntry(), compareEntry(), usageEntry()];
    expect(BatchRequestSchema.safeParse({ decisions }).success).toBe(true);
  });
});

describe("MAX_BATCH_BYTES", () => {
  it("is 64 KiB", () => {
    expect(MAX_BATCH_BYTES).toBe(65_536);
  });
});
