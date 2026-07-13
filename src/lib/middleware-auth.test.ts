import { describe, it, expect } from "vitest";
import { isRequestAuthorized } from "./middleware-auth";
import { config } from "@/proxy";

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

describe("public-path matcher (which routes invoke the auth middleware)", () => {
  const pattern = config.matcher[0];
  const re = matcherToRegExp(pattern);
  // Next.js runs middleware only on paths the matcher matches. A path the
  // matcher EXCLUDES is public — it can be opened without a session and is
  // never redirected to /login.
  const isPublic = (pathname: string) => !re.test(pathname);

  it("treats the dev-only /tutorial preview as public (no login redirect)", () => {
    expect(isPublic("/tutorial")).toBe(true);
  });

  it("does not open any OTHER protected route — only /tutorial", () => {
    // The security-relevant claim: normal app routes still run the middleware
    // (and would redirect an unauthenticated visitor to /login).
    expect(isPublic("/collections")).toBe(false);
    expect(isPublic("/collections/col_123/pool")).toBe(false);
    expect(isPublic("/profile")).toBe(false);
    expect(isPublic("/sessions/sess_1")).toBe(false);
    // The exclusion adds exactly one token to the lookahead (`tutorial`),
    // matching how login/signup/shared are excluded — it does not widen any
    // existing gate. There is no `/tutorials*` route in the app, so the
    // lookahead's prefix nature (shared by every entry) exposes nothing.
  });

  it("still excludes the pre-existing public paths", () => {
    expect(isPublic("/login")).toBe(true);
    expect(isPublic("/signup")).toBe(true);
    expect(isPublic("/shared/abc")).toBe(true);
  });
});
