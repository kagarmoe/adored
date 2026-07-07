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

import {
  ExtractionSchema,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_FORMAT,
} from "./voice-extract";

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

// The hand-built EXTRACTION_FORMAT is the bridge messages.parse() consumes in
// place of zodOutputFormat. The route tests mock messages.parse wholesale, so this
// is the ONLY gate that exercises the real parse bridge.
describe("EXTRACTION_FORMAT parse bridge", () => {
  it("parses a valid JSON string into the validated object", () => {
    const out = EXTRACTION_FORMAT.parse(
      JSON.stringify({ brand: "Prada", color: "black", width: 11 }),
    );
    expect(out).toEqual({ brand: "Prada", color: "black", width: 11 });
  });

  // The bridge degrades to `null` (never a throw) so the SDK reports
  // parsed_output === null, which the route maps to a 422 "extraction failed" —
  // NOT a transport-shaped 500. A throw here would surface as an AnthropicError and
  // wrongly become a 500, so returning null is load-bearing for the spec's 422.
  it("returns null on invalid JSON", () => {
    expect(EXTRACTION_FORMAT.parse("{not json")).toBeNull();
  });

  it("returns null on schema-violating JSON", () => {
    // `unit` is constrained to imperial|metric; a bad enum value fails validation.
    expect(
      EXTRACTION_FORMAT.parse(JSON.stringify({ unit: "furlongs" })),
    ).toBeNull();
  });

  it("has the exact shape messages.parse consumes (parser.js: getOutputFormat + parseOutputFormat)", () => {
    // Per node_modules/@anthropic-ai/sdk/lib/parser.js, parseOutputFormat reads two
    // keys off the format object: it requires `type === "json_schema"` and calls
    // `parse` when `"parse" in outputFormat`. Assert both are present and correct.
    expect(EXTRACTION_FORMAT.type).toBe("json_schema");
    expect("parse" in EXTRACTION_FORMAT).toBe(true);
    expect(typeof EXTRACTION_FORMAT.parse).toBe("function");
  });
});
