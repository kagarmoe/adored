// Shared auth mock factory for route integration tests.
// Usage: vi.mock("@/lib/auth", () => mockAuth())
// Override getSession per-test: mockAuth().getSession.mockResolvedValue(...)
// Never importActual @/lib/auth — the spread form pulls in nodemailer.
import { vi } from "vitest";

export function mockAuth(getSession = vi.fn()) {
  const requireAuth = async () => {
    const s = await getSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  };
  return { getSession, requireAuth };
}
