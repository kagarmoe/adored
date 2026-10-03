// Migrations need Neon's direct endpoint: the pooler silently drops lock_timeout as a
// startup parameter (observed 2026-10-03). Keyed on the pooled host, not on presence:
// a Vercel var pulled into .env.local must never override a local/test DATABASE_URL
// and migrate the real database (purses-w7ss.8). For a "-pooler" DATABASE_URL, a
// POSTGRES_URL_NON_POOLING naming the same endpoint, database and user is used as-is;
// otherwise the direct host is derived by dropping "-pooler" (Neon's convention, same
// credentials), with a warning when a supplied var was ignored. A derived URL can only
// ever reach the database DATABASE_URL already names. Warnings name the mismatched
// part only — never a URL or credential.
type MigrationUrl = {
  url: string;
  kind: "DATABASE_URL" | "non-pooling" | "derived-direct";
  host: string;
  warning?: string;
};

function parse(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
}

function nonPoolingProblem(pooled: URL, value: string): string | null {
  let direct: URL;
  try {
    direct = new URL(value);
  } catch {
    return "POSTGRES_URL_NON_POOLING is not a valid URL";
  }
  const mismatch =
    direct.hostname !== pooled.hostname.replace("-pooler", "")
      ? "endpoint"
      : direct.pathname !== pooled.pathname
        ? "database"
        : direct.username !== pooled.username
          ? "user"
          : null;
  return mismatch && `POSTGRES_URL_NON_POOLING points at a different ${mismatch} than DATABASE_URL`;
}

export function pickMigrationUrl(env: { DATABASE_URL?: string; POSTGRES_URL_NON_POOLING?: string }): MigrationUrl {
  const { DATABASE_URL, POSTGRES_URL_NON_POOLING } = env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
  const pooled = parse("DATABASE_URL", DATABASE_URL);
  if (!pooled.hostname.includes("-pooler")) {
    return { url: DATABASE_URL, kind: "DATABASE_URL", host: pooled.hostname };
  }
  const problem = POSTGRES_URL_NON_POOLING ? nonPoolingProblem(pooled, POSTGRES_URL_NON_POOLING) : null;
  if (POSTGRES_URL_NON_POOLING && !problem) {
    return { url: POSTGRES_URL_NON_POOLING, kind: "non-pooling", host: new URL(POSTGRES_URL_NON_POOLING).hostname };
  }
  const derived = new URL(pooled);
  derived.hostname = pooled.hostname.replace("-pooler", "");
  return {
    url: derived.toString(),
    kind: "derived-direct",
    host: derived.hostname,
    ...(problem ? { warning: `${problem} — ignoring it — using the direct host derived from DATABASE_URL instead` } : {}),
  };
}
