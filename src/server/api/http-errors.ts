import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";
import {
  DeleteResultStateError,
  SupersedeStateError,
  FinalizeStateError,
} from "@/server/services/SortResultService";
import { CurrentSessionExistsError } from "@/server/repositories/implementations/SessionRepository";

/**
 * Shared error-to-HTTP-response mapper for API route handlers.
 *
 * Maps well-known error types to their canonical HTTP status codes so every
 * route returns consistent, correct responses without duplicated catch logic.
 * Routes should call this in their catch block and return the result directly.
 *
 * Mapping:
 *   SyntaxError              → 400 "Invalid JSON"
 *   ZodError                 → 400 "Invalid input" + flatten details
 *   DeleteResultStateError
 *   | SupersedeStateError
 *   | FinalizeStateError
 *   | CurrentSessionExistsError → 409 (error.message)
 *   UnauthorizedError
 *   | Error("Unauthorized")  → 401
 *   any other Error          → 500 (error.message)
 *   non-Error unknown        → 500 "Unknown error"
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", details: error.flatten() },
      { status: 400 },
    );
  }
  if (
    error instanceof DeleteResultStateError ||
    error instanceof SupersedeStateError ||
    error instanceof FinalizeStateError ||
    error instanceof CurrentSessionExistsError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.message === "Unauthorized")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 },
  );
}
