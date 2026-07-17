import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isRequestAuthorized } from "./middleware-auth";
import proxy, { config } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

// The matcher's negative-lookahead is the actual mechanism that makes a path
// "public": paths it excludes never invoke withAuth, so they are never
// redirected to /login. Build the same regex Next.js applies to a pathname.
const matcherToRegExp = (pattern: string) =>
  new RegExp("^" + pattern + "$");

describe("middleware authorization predicate", () => {
  it("allows the Blob upload-completion callback through without a session", () => {
    // Vercel Blob's onUploadCompleted is a server-to-server POST with no
    // user session; the route verifies the Blob-signed payload itself.
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/upload", false),
    ).toBe(true);
  });

  it("still requires a session for other protected routes", () => {
    expect(isRequestAuthorized("/api/collections/col_123/items", false)).toBe(false);
    expect(isRequestAuthorized("/collections/col_123/pool", false)).toBe(false);
    // The pool photo FILE route is browser-loaded (has cookies) — stays protected.
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/photos/photo_1/file", false),
    ).toBe(false);
  });

  it("allows authenticated users through normally", () => {
    expect(isRequestAuthorized("/collections/col_123/pool", true)).toBe(true);
    expect(isRequestAuthorized("/api/collections/col_123/items", true)).toBe(true);
  });

  it("does not allow a forged path that merely contains the upload segment", () => {
    expect(
      isRequestAuthorized("/api/collections/col_123/pool/upload/extra", false),
    ).toBe(false);
    expect(
      isRequestAuthorized("/evil/api/collections/col_123/pool/upload", false),
    ).toBe(false);
  });
});

describe("dev auth bypass", () => {
  it("lets npm-run-dev protected routes through without a session cookie", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_BYPASS", "1");

    const response = proxy(new NextRequest("http://localhost/collections"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("public-path matcher (which routes invoke the auth middleware)", () => {
  const pattern = config.matcher[0];
  const re = matcherToRegExp(pattern);
  // Next.js runs middleware only on paths the matcher matches. A path the
  // matcher EXCLUDES is public — it can be opened without a session and is
  // never redirected to /login.
  const isPublic = (pathname: string) => !re.test(pathname);

  it("treats the legacy /tutorial redirect as public (no login redirect)", () => {
    expect(isPublic("/tutorial")).toBe(true);
  });

  it("treats the public tutorials area as public (no login redirect)", () => {
    expect(isPublic("/tutorials")).toBe(true);
    expect(isPublic("/tutorials/sort")).toBe(true);
    expect(isPublic("/tutorials/collection")).toBe(true);
  });

  it("treats onboarding sample images as public assets", () => {
    expect(isPublic("/onboarding/red-garden-clippers.webp")).toBe(true);
    expect(isPublic("/onboarding/charcoal-knit-cardigan.webp")).toBe(true);
  });

  it("treats shared result links as public — the share promises 'no account, no signing in'", () => {
    expect(isPublic("/shared-results/tok_abc123")).toBe(true);
  });

  it("treats the invitation accept page and its GET preview as public — the token is the read capability", () => {
    expect(isPublic("/invitations/tok_1")).toBe(true);
    expect(isPublic("/api/invitations/accept")).toBe(true);
  });

  it("does not open other protected app routes", () => {
    // The security-relevant claim: normal app routes still run the middleware
    // (and would redirect an unauthenticated visitor to /login).
    expect(isPublic("/collections")).toBe(false);
    expect(isPublic("/collections/col_123/pool")).toBe(false);
    expect(isPublic("/profile")).toBe(false);
    expect(isPublic("/sessions/sess_1")).toBe(false);
    expect(isPublic("/tutorial-ish")).toBe(false);
    expect(isPublic("/onboarding-assets")).toBe(false);
    expect(isPublic("/shared-resultsish")).toBe(false);
    // No /shared/* route exists; the old exclusion was dead and is gone.
    expect(isPublic("/shared/abc")).toBe(false);
    // Lookalike path — must not accidentally match the invitations exclusion.
    expect(isPublic("/invitationsish")).toBe(false);
  });

  it("still excludes the pre-existing public paths", () => {
    expect(isPublic("/login")).toBe(true);
    expect(isPublic("/signup")).toBe(true);
  });
});

describe("login redirect", () => {
  it("carries the original path as callbackUrl so sign-in returns there", () => {
    // /invitations/* is now public (see above) so it no longer redirects; a
    // still-protected route exercises the same callbackUrl mechanism instead.
    const response = proxy(new NextRequest("http://localhost/collections/col_1"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/collections/col_1");
  });
});
