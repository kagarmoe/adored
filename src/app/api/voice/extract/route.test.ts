import { beforeEach, describe, expect, it, vi } from "vitest";

// Route tests mock the Anthropic SDK at the module boundary (the one legitimate
// mock) and the usual infra boundaries (auth, db, env, posthog). The real
// voice-extract service runs — only the SDK underneath it is faked. server-only is
// a build-time guard that throws in Node.
const {
  mockGetSession,
  mockGetDb,
  mockParse,
  mockCapture,
  mockFlush,
  mockEnv,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockParse: vi.fn(),
  mockCapture: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    ANTHROPIC_API_KEY: "sk-test" as string | undefined,
    VOICE_DAILY_CALL_CAP: 50,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockCapture, flush: mockFlush }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: mockParse };
  },
}));

import { POST } from "./route";

const USER = "usr_1";

// Chainable fake for the upsert-increment: returns the given post-increment count.
function fakeDb(count: number) {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve([{ count }]),
        }),
      }),
    }),
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/voice/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function post(request: Request) {
  // The route types its param as NextRequest; a plain Request is structurally
  // sufficient for these handler tests.
  return POST(request as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: USER } });
  mockGetDb.mockReturnValue(fakeDb(1));
  mockFlush.mockResolvedValue(undefined);
  mockEnv.ANTHROPIC_API_KEY = "sk-test";
  mockEnv.VOICE_DAILY_CALL_CAP = 50;
});

describe("POST /api/voice/extract — auth & input", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(401);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("503 with gentle copy when ANTHROPIC_API_KEY is missing", async () => {
    mockEnv.ANTHROPIC_API_KEY = undefined;
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Voice capture isn't available right now.");
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("400 when the transcript is empty", async () => {
    const res = await post(req({ transcript: "" }));
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("400 when the transcript is missing", async () => {
    const res = await post(req({}));
    expect(res.status).toBe(400);
  });

  it("400 on invalid JSON", async () => {
    const bad = new Request("http://localhost/api/voice/extract", {
      method: "POST",
      body: "{not json",
    });
    const res = await post(bad);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/voice/extract — cost cap", () => {
  it("429 with gentle copy once the daily cap is exceeded, without calling the model", async () => {
    mockGetDb.mockReturnValue(fakeDb(51)); // 51 > cap of 50
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe(
      "Voice needs a rest today — everything still works by typing.",
    );
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockCapture.mock.calls[0][0].properties.outcome).toBe("cap_exceeded");
  });

  it("allows the call exactly at the cap boundary", async () => {
    mockGetDb.mockReturnValue(fakeDb(50)); // 50 is allowed; 51 is not
    mockParse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { brand: "Prada" },
    });
    const res = await post(req({ transcript: "a Prada bag" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/voice/extract — extraction outcomes", () => {
  it("200 with bare sanitized JSON on success", async () => {
    mockParse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        brand: "Prada",
        color: "black",
        category: "shoulder bag",
      },
    });
    const res = await post(req({ transcript: "This is a black Prada shoulder bag" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      brand: "Prada",
      color: "black",
      category: "shoulder bag",
    });
  });

  it("422 on a safety refusal (stop_reason 'refusal', null parse)", async () => {
    mockParse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(422);
  });

  it("422 when parsed_output is null (malformed/invalid structured output)", async () => {
    mockParse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null });
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(422);
  });

  it("422 on max_tokens truncation", async () => {
    mockParse.mockResolvedValue({
      stop_reason: "max_tokens",
      parsed_output: { brand: "Prada" },
    });
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(422);
  });

  it("500 with a fixed message and NO SDK error-text leakage", async () => {
    mockParse.mockRejectedValue(new Error("SDK secret detail ABC123XYZ"));
    const res = await post(req({ transcript: "a black Prada bag" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(
      "Something went wrong on our end. You can type the details instead.",
    );
    expect(JSON.stringify(body)).not.toContain("ABC123XYZ");
  });
});

describe("POST /api/voice/extract — telemetry never breaks the request path", () => {
  // A rejecting PostHog flush must be swallowed inside emit() — otherwise a paid,
  // successful extraction (or a 429/422) would surface as a 500.
  it("still returns 200 when the telemetry flush rejects", async () => {
    mockFlush.mockRejectedValue(new Error("posthog down"));
    mockParse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { brand: "Prada" },
    });
    const res = await post(req({ transcript: "a Prada bag" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ brand: "Prada" });
  });

  it("still returns 429 when the telemetry flush rejects at the cap", async () => {
    mockFlush.mockRejectedValue(new Error("posthog down"));
    mockGetDb.mockReturnValue(fakeDb(51));
    const res = await post(req({ transcript: "a Prada bag" }));
    expect(res.status).toBe(429);
  });

  it("still returns 422 when the telemetry flush rejects on extraction failure", async () => {
    mockFlush.mockRejectedValue(new Error("posthog down"));
    mockParse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    const res = await post(req({ transcript: "a Prada bag" }));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/voice/extract — analytics privacy", () => {
  it("captures voice_capture_used with outcome/latency and NO transcript content", async () => {
    const marker = "SECRET_TRANSCRIPT_MARKER_9f2";
    mockParse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { brand: "Prada" },
    });
    await post(req({ transcript: `${marker} a black Prada bag` }));

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const payload = mockCapture.mock.calls[0][0];
    expect(payload.event).toBe("voice_capture_used");
    expect(payload.properties.outcome).toBe("success");
    expect(typeof payload.properties.latency_ms).toBe("number");
    // The whole emitted payload must never carry transcript text.
    expect(JSON.stringify(payload)).not.toContain(marker);
  });
});
