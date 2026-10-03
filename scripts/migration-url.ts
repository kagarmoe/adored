// Use the direct URL only when DATABASE_URL is Neon's pooled endpoint (host contains
// "-pooler"), so lock_timeout binds to the migration backend in prod. Keyed on the
// pooled host, not on presence: a Vercel var pulled into .env.local must never
// override a local/test DATABASE_URL and migrate the real database (purses-w7ss.8).
export function pickMigrationUrl(env: {
  DATABASE_URL?: string;
  POSTGRES_URL_NON_POOLING?: string;
}): { url: string; kind: "non-pooling" | "DATABASE_URL" } {
  const { DATABASE_URL, POSTGRES_URL_NON_POOLING } = env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
  let host: string;
  try {
    host = new URL(DATABASE_URL).hostname;
  } catch {
    host = DATABASE_URL;
  }
  if (host.includes("-pooler") && POSTGRES_URL_NON_POOLING) return { url: POSTGRES_URL_NON_POOLING, kind: "non-pooling" };
  return { url: DATABASE_URL, kind: "DATABASE_URL" };
}
