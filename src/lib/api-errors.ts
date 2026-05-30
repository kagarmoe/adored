import { ZodError } from "zod";
import { NextResponse } from "next/server";

export interface ErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}

export function formatZodErrors(error: ZodError): ErrorResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  return {
    error: "Validation error",
    details,
  };
}

export function handleError(error: unknown): {
  status: number;
  body: ErrorResponse | { error: string };
} {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: formatZodErrors(error),
    };
  }

  if (error instanceof Error) {
    if (error.name === "UnauthorizedError") {
      return {
        status: 401,
        body: { error: error.message },
      };
    }

    if (error.message === "Forbidden") {
      return {
        status: 403,
        body: { error: error.message },
      };
    }

    if (error.message.includes("not found")) {
      return {
        status: 404,
        body: { error: error.message },
      };
    }

    return {
      status: 500,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: { error: "Unknown error" },
  };
}

export function errorResponse(error: unknown): NextResponse {
  const { status, body } = handleError(error);
  return NextResponse.json(body, { status });
}
