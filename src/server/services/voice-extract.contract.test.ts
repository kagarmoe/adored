import { describe, expect, it, vi } from "vitest";

// See the note in voice-extract.ts: the spec's original guard was
// `zodOutputFormat(ExtractionSchema) compiles`. That SDK helper hard-imports
// `zod/v4`, which this repo's pinned Zod 3.23.8 does not provide (importing it
// throws), so the extractor hand-builds the structured-output format. These
// assertions preserve that guard's INTENT under Zod 3.23.8:
//   1. ExtractionSchema stays bounds-free (structured outputs strip bounds, and a
//      bounded schema breaks parsing) — the "illegal-constraint drift" guard.
//   2. the hand-authored JSON schema stays in lockstep with ExtractionSchema — the
//      drift guard the zodOutputFormat helper would otherwise have provided.
// Runs in the normal gate with no API key.
vi.mock("server-only", () => ({}));

import { ExtractionSchema, EXTRACTION_JSON_SCHEMA } from "./voice-extract";

describe("voice-extract structured-output contract", () => {
  it("ExtractionSchema carries no string/number bounds (bounds break structured-output parsing)", () => {
    // A 500-char string and a huge number must validate — if a `.max()`/`.min()`
    // drifted onto the model-facing schema, these would fail.
    const result = ExtractionSchema.safeParse({
      brand: "x".repeat(500),
      width: 999_999,
      otherDetails: Array.from({ length: 50 }, (_, i) => `d${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("the hand-authored JSON schema properties match ExtractionSchema's fields", () => {
    const schemaKeys = Object.keys(ExtractionSchema.shape).sort();
    const jsonProps = EXTRACTION_JSON_SCHEMA.properties as Record<string, unknown>;
    const jsonKeys = Object.keys(jsonProps).sort();
    expect(jsonKeys).toEqual(schemaKeys);
  });

  it("the JSON schema forbids extra properties (structured-outputs requirement)", () => {
    expect(EXTRACTION_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});
