// Use the direct URL only when DATABASE_URL is Neon's pooled endpoint (host contains
// "-pooler"), so lock_timeout binds to the migration backend in prod. Keyed on the
// pooled host, not on presence: a Vercel var pulled into .env.local must never
// override a local/test DATABASE_URL and migrate the real database (purses-w7ss.8).
// The switch only happens when the direct URL names the same Neon endpoint, database
// and user; any mismatch refuses, so an operator typo can never migrate another
// database. Messages name the mismatched part only — never a URL or credential.
type MigrationUrl = { url: string; kind: "non-pooling" | "DATABASE_URL"; host: string };

function parse(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
}

export function pickMigrationUrl(env: { DATABASE_URL?: string; POSTGRES_URL_NON_POOLING?: string }): MigrationUrl {
  const { DATABASE_URL, POSTGRES_URL_NON_POOLING } = env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
  const pooled = parse("DATABASE_URL", DATABASE_URL);
  if (!pooled.hostname.includes("-pooler") || !POSTGRES_URL_NON_POOLING) {
    return { url: DATABASE_URL, kind: "DATABASE_URL", host: pooled.hostname };
  }
  const direct = parse("POSTGRES_URL_NON_POOLING", POSTGRES_URL_NON_POOLING);
  const mismatch =
    direct.hostname !== pooled.hostname.replace("-pooler", "")
      ? "endpoint"
      : direct.pathname !== pooled.pathname
        ? "database"
        : direct.username !== pooled.username
          ? "user"
          : null;
  if (mismatch) {
    throw new Error(`POSTGRES_URL_NON_POOLING points at a different ${mismatch} than DATABASE_URL — refusing to migrate`);
  }
  return { url: POSTGRES_URL_NON_POOLING, kind: "non-pooling", host: direct.hostname };
}
