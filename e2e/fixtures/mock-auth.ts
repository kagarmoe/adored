// Shared auth mock factory for route integration tests.
// Usage: vi.mock("@/lib/auth", () => mockAuth())
// Override getSession per-test: mockAuth().getSession.mockResolvedValue(...)
// Never importActual @/lib/auth — the spread form pulls in nodemailer.
import { vi } from "vitest";

// Replicated here so http-errors.ts (which imports UnauthorizedError from @/lib/auth)
// gets a real class to instanceof-check against when @/lib/auth is mocked.
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function mockAuth(getSession = vi.fn()) {
  const requireAuth = async () => {
    const s = await getSession();
    if (!s?.user) throw new UnauthorizedError();
    return s.user;
  };
  return { getSession, requireAuth, UnauthorizedError };
}
