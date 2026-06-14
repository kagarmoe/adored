// Paths that the auth middleware must allow WITHOUT a user session.
//
// Vercel Blob's client-upload completion callback (`onUploadCompleted`) is a
// server-to-server POST with no session cookie. The route handler verifies the
// Blob-signed payload itself (via `handleUpload`), and the token-generation
// phase on the same route self-authorizes with `getSession`. So this one path
// is safe to let past `withAuth`; without this, the callback is 307-redirected
// to /login and the durable pool row is never written.
const SESSIONLESS_POST_ROUTES: RegExp[] = [
  /^\/api\/collections\/[^/]+\/pool\/upload$/,
];

export function isRequestAuthorized(pathname: string, hasToken: boolean): boolean {
  if (SESSIONLESS_POST_ROUTES.some((re) => re.test(pathname))) {
    return true;
  }
  return hasToken;
}
