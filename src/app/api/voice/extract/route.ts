import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { recordVoiceUsage } from "@/lib/db/voice-usage";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { extractItemDetails } from "@/server/services/voice-extract";
import { getPostHogClient } from "@/lib/posthog-server";

// node-postgres cap upsert needs the Node runtime (not Edge); the LLM call gets a
// generous, explicit function budget.
export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  transcript: z.string().min(1).max(1500),
});

// Copy litmus: the person's side, gentle, no counting-against framing.
const UNAVAILABLE_MESSAGE = "Voice capture isn't available right now.";
const CAP_MESSAGE =
  "Voice needs a rest today — everything still works by typing.";
const EXTRACT_FAILED_MESSAGE =
  "I couldn't quite catch that. You can type the details instead.";
const SERVER_ERROR_MESSAGE =
  "Something went wrong on our end. You can type the details instead.";

// PostHog carries the outcome and latency ONLY — never transcript content.
// Telemetry must never break the request path: a failed flush cannot turn a
// successful paid extraction (or a 429/422) into a 500, so this swallows its own
// errors rather than rejecting into the handler's try/catch.
async function emit(
  userId: string,
  outcome: string,
  latencyMs: number,
): Promise<void> {
  try {
    const ph = getPostHogClient();
    ph.capture({
      distinctId: userId,
      event: "voice_capture_used",
      properties: { outcome, latency_ms: latencyMs },
    });
    await ph.flush();
  } catch (err) {
    console.warn("voice_capture_used telemetry failed", err);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // No preflight: the mic renders on any speech-capable browser, so the person has
  // already spoken by the time this can fail. Missing key -> gentle 503.
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { transcript } = parsed.data;

  const startedAt = Date.now();
  try {
    // Cost control: count this call first, then reject past the cap. A hostile
    // authenticated user gets at most VOICE_DAILY_CALL_CAP calls per day.
    const { capExceeded } = await recordVoiceUsage(
      getDb(),
      userId,
      env.VOICE_DAILY_CALL_CAP,
    );
    if (capExceeded) {
      await emit(userId, "cap_exceeded", Date.now() - startedAt);
      return NextResponse.json({ error: CAP_MESSAGE }, { status: 429 });
    }

    const result = await extractItemDetails(transcript);
    const latencyMs = Date.now() - startedAt;
    if (!result.ok) {
      await emit(userId, "extraction_failed", latencyMs);
      return NextResponse.json({ error: EXTRACT_FAILED_MESSAGE }, { status: 422 });
    }

    await emit(userId, "success", latencyMs);
    // Bare sanitized JSON — no ApiResponse envelope, matching every other route.
    return NextResponse.json(result.details, { status: 200 });
  } catch {
    // SDK/DB/unknown errors -> FIXED generic message. SDK error text never passes
    // through (extractItemDetails already rethrows a generic error).
    await emit(userId, "error", Date.now() - startedAt);
    return NextResponse.json({ error: SERVER_ERROR_MESSAGE }, { status: 500 });
  }
}
