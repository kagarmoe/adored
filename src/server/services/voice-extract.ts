import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Single named constant for the model, so the owner can flip it in one place. The
// owner may flip this to 'claude-haiku-4-5' (~5x cheaper and sufficient for this
// bounded extraction); the per-user daily cap bounds worst-case spend either way.
export const MODEL = "claude-opus-4-8";

const MAX_TOKENS = 1000;

const STRING_MAX = 120;
const OTHER_DETAILS_MAX_ITEMS = 10;
const DIMENSION_MAX = 10000;

// The permissive schema handed to the model. Deliberately carries NO bounds:
// Anthropic structured outputs silently strip numeric/length constraints, and a
// bounded schema makes the parse fail (null) instead of degrading. All bounds live
// in SanitizeSchema below, applied server-side to the parsed output.
export const ExtractionSchema = z.object({
  name: z.string().optional(),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
  depth: z.number().optional(),
  weight: z.number().optional(),
  unit: z.enum(["imperial", "metric"]).optional(),
  otherDetails: z.array(z.string()).optional(),
});

const boundedString = z.string().max(STRING_MAX).optional();

// Clamp (don't reject) numbers to a finite, positive value <= DIMENSION_MAX. A
// non-finite or non-positive value is dropped rather than failing the whole result.
const clampedDimension = z
  .number()
  .optional()
  .transform((n) => {
    if (n === undefined) return undefined;
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(n, DIMENSION_MAX);
  });

// The bounded schema applied server-side before the value ever reaches the client.
// Strings mirror the form caps; otherDetails is capped in count and length; numbers
// are clamped; unknown keys are stripped.
const SanitizeSchema = z
  .object({
    name: boundedString,
    brand: boundedString,
    style: boundedString,
    color: boundedString,
    material: boundedString,
    category: boundedString,
    height: clampedDimension,
    width: clampedDimension,
    depth: clampedDimension,
    weight: clampedDimension,
    unit: z.enum(["imperial", "metric"]).optional(),
    otherDetails: z
      .array(z.string().max(STRING_MAX))
      .max(OTHER_DETAILS_MAX_ITEMS)
      .optional(),
  })
  .strip();

export type ExtractedItemDetails = z.infer<typeof SanitizeSchema>;

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Apply the bounded SanitizeSchema to a raw extraction. Returns the cleaned
 * details, or null when the value can't be sanitized (e.g. an over-length string).
 */
export function sanitizeExtraction(raw: unknown): ExtractedItemDetails | null {
  const result = SanitizeSchema.safeParse(raw);
  if (!result.success) return null;
  return pruneUndefined(result.data);
}

// The JSON schema handed to the model via structured outputs. Kept in lockstep with
// ExtractionSchema (voice-extract.contract.test.ts guards the drift).
//
// NOTE: the spec calls for `zodOutputFormat(ExtractionSchema)` from
// '@anthropic-ai/sdk/helpers/zod'. That helper hard-imports `zod/v4`, which this
// repo's pinned Zod 3.23.8 does not provide — importing it throws. We keep the
// identical `messages.parse()` + `parsed_output` contract by hand-building the
// parseable format object below (a plain json_schema plus a Zod-v3 `parse`).
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    brand: { type: "string" },
    style: { type: "string" },
    color: { type: "string" },
    material: { type: "string" },
    category: { type: "string" },
    height: { type: "number" },
    width: { type: "number" },
    depth: { type: "number" },
    weight: { type: "number" },
    unit: { type: "string", enum: ["imperial", "metric"] },
    otherDetails: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM_PROMPT = [
  "You turn a spoken description of a single fashion item into structured fields.",
  "Extract only what the speaker actually said. Never invent, guess, or infer a value that was not spoken — omit any field you are unsure about.",
  "Map spoken facts to their fields: brand, color, category, material, style, name, and the height/width/depth/weight dimensions.",
  "Put any spoken fact that does not map to one of those fields — a strap length, a hardware note, a condition remark — verbatim into otherDetails.",
  "For dimensions the unit follows the dimension clauses: use 'imperial' for inches/feet/pounds and 'metric' for cm/mm/kg. In a mixed-unit description the dimension clauses decide the unit; any odd-unit clause (for example a strap measured in a different unit) goes verbatim into otherDetails rather than changing the unit.",
].join("\n");

// The parseable structured-output format. messages.parse() calls `parse()` on the
// content and exposes the result as `parsed_output`; we validate with the Zod-v3
// ExtractionSchema and return null on malformed/invalid output (a null parse, which
// the caller treats as an extraction failure).
const EXTRACTION_FORMAT = {
  type: "json_schema" as const,
  schema: EXTRACTION_JSON_SCHEMA,
  parse: (content: string): z.infer<typeof ExtractionSchema> | null => {
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return null;
    }
    const parsed = ExtractionSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Lazy construction: the route guarantees ANTHROPIC_API_KEY is present before it
  // calls us, so constructing here (not at module load) keeps the 503-when-absent
  // path intact and never throws at import.
  if (!client) client = new Anthropic({ maxRetries: 1 });
  return client;
}

export type ExtractResult =
  | { ok: true; details: ExtractedItemDetails }
  | { ok: false };

/**
 * Extract structured item details from a transcript. Returns a typed result:
 * `{ ok: false }` for extraction-quality failures (safety refusal, truncation, or a
 * null/invalid parse), and throws a generic error (never a raw SDK error) for
 * transport/SDK failures — the route maps those to a fixed 500.
 */
export async function extractItemDetails(
  transcript: string,
): Promise<ExtractResult> {
  let response;
  try {
    response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
      output_config: { format: EXTRACTION_FORMAT },
    });
  } catch {
    // Never surface a raw SDK/transport error upward — the route maps this to a
    // fixed generic 500 message.
    throw new Error("voice_extract_upstream_error");
  }

  // A safety refusal arrives as HTTP 200 with stop_reason 'refusal'; a truncated
  // response as 'max_tokens'; a malformed/invalid structured output as a null
  // parse. All three are extraction failures, not infrastructure errors.
  if (
    response.stop_reason === "refusal" ||
    response.stop_reason === "max_tokens" ||
    response.parsed_output == null
  ) {
    return { ok: false };
  }

  const details = sanitizeExtraction(response.parsed_output);
  if (!details) return { ok: false };
  return { ok: true, details };
}
