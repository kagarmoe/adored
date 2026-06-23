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
} from "@/server/services/SortResultService";
import { errorResponse } from "./http-errors";

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
    expect(b.details).toEqual(err.flatten());
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

  it("maps a generic Error → 500 with the error message", async () => {
    const res = errorResponse(new Error("Something went wrong"));
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: "Something went wrong" });
  });

  it("maps a non-Error unknown → 500 with 'Unknown error'", async () => {
    const res = errorResponse("oops string");
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: "Unknown error" });
  });
});
