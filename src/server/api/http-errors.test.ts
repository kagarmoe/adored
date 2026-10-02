// @vitest-environment node
//
// Unit tests for the shared errorResponse helper (src/server/api/http-errors.ts).
// Every branch gets a test: SyntaxError→400, ZodError→400 with flatten details,
// each typed state error→409, UnauthorizedError→401, plain "Unauthorized" message→401,
// generic Error→500, non-Error unknown→500.
//
// These are pure unit tests — no DB, no mocks needed beyond the helpers themselves.
// @/lib/auth is mocked to prevent nodemailer from being required transitively.

import { describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";

// Hoist the class definition so it is available inside the vi.mock factory.
const { UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "UnauthorizedError";
    }
  }
  return { UnauthorizedError };
});

// Mock @/lib/auth to prevent nodemailer from being required transitively.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  requireAuth: vi.fn(),
  UnauthorizedError,
}));

import {
  DeleteResultStateError,
  SupersedeStateError,
  FinalizeStateError,
  PinTargetError,
} from "@/server/services/SortResultService";
import { PreferenceExistsError } from "@/server/api/dispositions";
import { PoolGroupError } from "@/server/services/ItemService";
import { ItemInResultError } from "@/server/services/ItemPurgeService";
import { InvitationAcceptError } from "@/server/services/InvitationAcceptService";
import { errorResponse, HttpError } from "./http-errors";

/** Parse the JSON body of a NextResponse for assertions. */
async function body(res: Response): Promise<unknown> {
  return res.json();
}

/** Generate a real ZodError by deliberately failing a parse. */
function zodError(): ZodError {
  const schema = z.object({ name: z.string().min(1) });
  const result = schema.safeParse({ name: "" });
  if (!result.success) return result.error;
  throw new Error("expected safeParse to fail");
}

describe("errorResponse", () => {
  it("maps SyntaxError → 400 with 'Invalid JSON'", async () => {
    const res = errorResponse(new SyntaxError("Unexpected token"));
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: "Invalid JSON" });
  });

  it("maps ZodError → 400 with 'Invalid input' and flatten details", async () => {
    const err = zodError();
    const res = errorResponse(err);
    expect(res.status).toBe(400);
    const b = (await body(res)) as { error: string; details: unknown };
    expect(b.error).toBe("Invalid input");
    // Literal pin of the 400-body `details` contract (asserting against
    // err.flatten() would auto-adapt across zod majors and hide wire-format
    // changes). It fired at the zod 3→4 flip exactly as designed; the delta
    // was message TEXT only, structure identical — accepted deliberately
    // (details is developer-facing; no client renders it, see docs/API.md
    // error-bodies section). These are zod 4's literal strings; the pin stays
    // armed against the next format change.
    expect(b.details).toEqual({
      formErrors: [],
      fieldErrors: {
        name: ["Too small: expected string to have >=1 characters"],
      },
    });
  });

  it("maps DeleteResultStateError → 409 with the error message", async () => {
    const res = errorResponse(new DeleteResultStateError());
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ error: "Can only delete draft results" });
  });

  it("maps SupersedeStateError → 409 with the error message", async () => {
    const res = errorResponse(new SupersedeStateError());
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ error: "Can only supersede finalized results" });
  });

  it("maps FinalizeStateError → 409 with the error message", async () => {
    const res = errorResponse(new FinalizeStateError());
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ error: "Can only finalize draft results" });
  });

  it("maps UnauthorizedError → 401", async () => {
    const res = errorResponse(new UnauthorizedError());
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: "Unauthorized" });
  });

  it("maps a plain Error with message 'Unauthorized' → 401", async () => {
    const res = errorResponse(new Error("Unauthorized"));
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: "Unauthorized" });
  });

  it("maps PinTargetError → 404 with the error message", async () => {
    const res = errorResponse(new PinTargetError());
    expect(res.status).toBe(404);
    expect(await body(res)).toEqual({ error: "That piece can't be placed here." });
  });

  // These five mappings are what let every route's catch delegate here unconditionally.
  // Without them the routes' own statuses (409 / 400 / error.status) silently become a
  // generic 500 — so each one is the regression guard for its route.
  it("maps PreferenceExistsError → 409 with the error message", async () => {
    const res = errorResponse(new PreferenceExistsError());
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({
      error: "Item already has a preference; cannot set a disposition on a triaged item",
    });
  });

  it("maps ItemInResultError → 409 with the error message", async () => {
    const res = errorResponse(new ItemInResultError());
    expect(res.status).toBe(409);
    expect((await body(res)) as { error: string }).toEqual({
      error: new ItemInResultError().message,
    });
  });

  it("maps PoolGroupError code 'conflict' → 409, other codes → 400", async () => {
    const conflict = errorResponse(new PoolGroupError("conflict", "Already grouped"));
    expect(conflict.status).toBe(409);
    expect(await body(conflict)).toEqual({ error: "Already grouped" });

    const empty = errorResponse(new PoolGroupError("empty", "No photos selected"));
    expect(empty.status).toBe(400);
    expect(await body(empty)).toEqual({ error: "No photos selected" });
  });

  it("maps InvitationAcceptError → its own status with the error message", async () => {
    const res = errorResponse(new InvitationAcceptError("This invitation has expired", 404));
    expect(res.status).toBe(404);
    expect(await body(res)).toEqual({ error: "This invitation has expired" });
  });

  it("maps HttpError → its own status with the error message", async () => {
    const res = errorResponse(new HttpError("File too large", 413));
    expect(res.status).toBe(413);
    expect(await body(res)).toEqual({ error: "File too large" });
  });

  // purses-hiez: an unmapped error carries driver text (relation names, constraint
  // names, sometimes column values). The caller only ever gets curated copy + an
  // errorId to hand to a developer. (The no-leak guarantee under production is pinned
  // in "errorResponse 500 body in production" below — here NODE_ENV is "test", i.e.
  // local, so the detail is deliberately inlined.)
  it("maps a generic Error → 500 with generic copy, never the error message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error('duplicate key value violates unique constraint "users_email_key"');
    const res = errorResponse(err);
    expect(res.status).toBe(500);
    const b = (await body(res)) as { error: string; errorId: string };
    expect(b.error).toBe("Something went wrong. Please try again.");
    expect(b.errorId).toEqual(expect.any(String));
    spy.mockRestore();
  });

  it("maps a non-Error unknown → 500 with the same generic copy", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse("oops string");
    expect(res.status).toBe(500);
    const b = (await body(res)) as { error: string; errorId: string };
    expect(b.error).toBe("Something went wrong. Please try again.");
    expect(b.errorId).toEqual(expect.any(String));
    spy.mockRestore();
  });
});

// THE REGRESSION GUARD on the original leak (purses-hiez). Vercel sets
// NODE_ENV=production for PREVIEW deploys too, so gating the inline detail on
// NODE_ENV (not VERCEL_ENV) is what keeps driver text off every shareable
// preview URL. If someone loosens that gate, this test fails.
describe("errorResponse 500 body in production", () => {
  it("returns ONLY { error, errorId } — no detail, no stack, no driver text", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        name: "PostgresError",
        code: "23505",
        constraint_name: "users_email_key",
        table_name: "users",
        detail: "Key (email)=(a@b.com) already exists.",
      },
    );
    const res = errorResponse(new Error("save failed", { cause: pgError }));

    expect(res.status).toBe(500);
    const b = (await body(res)) as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(["error", "errorId"]);
    expect(b.error).toBe("Something went wrong. Please try again.");
    const wire = JSON.stringify(b);
    expect(wire).not.toContain("users_email_key");
    expect(wire).not.toContain("23505");
    expect(wire).not.toContain("a@b.com");
    expect(wire).not.toContain("stack");

    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("errorResponse 500 diagnostics", () => {
  it("logs one structured record with the SAME errorId as the body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("boom"));
    const b = (await body(res)) as { errorId: string };

    expect(spy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = spy.mock.calls[0] as [string, string];
    expect(prefix).toBe("[api_error]");
    const logged = JSON.parse(payload) as { errorId: string };
    expect(logged.errorId).toBe(b.errorId);
    spy.mockRestore();
  });

  it("logs name/message/stack (non-enumerable — a naive JSON.stringify(error) yields {})", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    expect(JSON.stringify(err)).toBe("{}"); // the classic trap this must avoid
    errorResponse(err);

    const logged = JSON.parse((spy.mock.calls[0] as [string, string])[1]) as {
      error: { name: string; message: string; stack: string };
    };
    expect(logged.error.name).toBe("Error");
    expect(logged.error.message).toBe("boom");
    expect(logged.error.stack).toContain("Error: boom");
    spy.mockRestore();
  });

  it("logs the postgres-js driver fields, and unwraps a wrapped cause", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pgError = Object.assign(new Error("duplicate key value"), {
      name: "PostgresError",
      code: "23505",
      severity: "ERROR",
      constraint_name: "users_email_key",
      table_name: "users",
      schema_name: "public",
      detail: "Key (email)=(a@b.com) already exists.",
      routine: "_bt_check_unique",
    });
    errorResponse(new Error("save failed", { cause: pgError }));

    const logged = JSON.parse((spy.mock.calls[0] as [string, string])[1]) as {
      error: { message: string; cause: Record<string, unknown> };
    };
    expect(logged.error.message).toBe("save failed");
    expect(logged.error.cause).toMatchObject({
      name: "PostgresError",
      message: "duplicate key value",
      code: "23505",
      severity: "ERROR",
      constraint_name: "users_email_key",
      table_name: "users",
      schema_name: "public",
      detail: "Key (email)=(a@b.com) already exists.",
      routine: "_bt_check_unique",
    });
    spy.mockRestore();
  });

  it("includes the detail inline in the body ONLY when running locally", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    const res = errorResponse(new Error("boom"));
    const b = (await body(res)) as { detail?: { message?: string } };
    expect(b.detail?.message).toBe("boom");
    vi.unstubAllEnvs();
    spy.mockRestore();
  });

  // A curated 4xx is intentional, safe copy — it must NOT grow an errorId or a
  // detail block. Adding either would be the regression.
  it("never adds errorId/detail to a curated 4xx", async () => {
    expect(await body(errorResponse(new HttpError("File too large", 413)))).toEqual({
      error: "File too large",
    });
    expect(await body(errorResponse(new DeleteResultStateError()))).toEqual({
      error: "Can only delete draft results",
    });
    expect(await body(errorResponse(new SyntaxError("Unexpected token")))).toEqual({
      error: "Invalid JSON",
    });
  });
});
