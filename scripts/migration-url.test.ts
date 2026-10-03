import { describe, expect, it } from "vitest";
import { pickMigrationUrl } from "./migration-url";

const POOLED = "postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
const TEST = "postgresql://postgres:test@localhost:5433/app_test";

describe("pickMigrationUrl (purses-w7ss.8)", () => {
  it("prefers the non-pooling URL when it names the same endpoint, database and user as the pooler", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: DIRECT })).toEqual({
      url: DIRECT,
      kind: "non-pooling",
      host: "ep-cool-123.us-east-2.aws.neon.tech",
    });
  });

  const DERIVED_HOST = "ep-cool-123.us-east-2.aws.neon.tech";
  const SUFFIX = " — ignoring it — using the direct host derived from DATABASE_URL instead";
  const derived = (warning?: string) => ({
    url: DIRECT,
    kind: "derived-direct",
    host: DERIVED_HOST,
    ...(warning ? { warning } : {}),
  });

  it("derives the direct host from a pooled DATABASE_URL when no non-pooling URL exists", () => {
    const r = pickMigrationUrl({ DATABASE_URL: POOLED });
    expect(r).toEqual(derived());
    const u = new URL(r.url);
    expect(u.hostname).toBe(DERIVED_HOST);
    expect([u.pathname, u.username, u.password, u.search]).toEqual(["/db", "u", "p", "?sslmode=require"]);
  });

  it("derives the direct host and warns on a different endpoint, without echoing credentials", () => {
    const other = "postgresql://u:secret@ep-other-999.us-east-2.aws.neon.tech/db";
    const r = pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: other });
    expect(r).toEqual(derived(`POSTGRES_URL_NON_POOLING points at a different endpoint than DATABASE_URL${SUFFIX}`));
    expect(r.warning).not.toMatch(/secret|ep-other|ep-cool|postgresql:|:p@/);
  });

  it("derives and warns on the same endpoint but a different database", () => {
    const otherDb = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/otherdb?sslmode=require";
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherDb })).toEqual(
      derived(`POSTGRES_URL_NON_POOLING points at a different database than DATABASE_URL${SUFFIX}`),
    );
  });

  it("derives and warns on a different user", () => {
    const otherUser = "postgresql://admin:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherUser })).toEqual(
      derived(`POSTGRES_URL_NON_POOLING points at a different user than DATABASE_URL${SUFFIX}`),
    );
  });

  it("derives and warns on an unparseable non-pooling URL", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: "not a url" })).toEqual(
      derived(`POSTGRES_URL_NON_POOLING is not a valid URL${SUFFIX}`),
    );
  });

  it("never lets a pulled non-pooling URL override a local/test DATABASE_URL", () => {
    expect(pickMigrationUrl({ DATABASE_URL: TEST, POSTGRES_URL_NON_POOLING: DIRECT })).toEqual({
      url: TEST,
      kind: "DATABASE_URL",
      host: "localhost",
    });
  });

  it("refuses an unparseable DATABASE_URL instead of guessing", () => {
    expect(() => pickMigrationUrl({ DATABASE_URL: "ep-cool-123-pooler garbage", POSTGRES_URL_NON_POOLING: DIRECT })).toThrow(
      "DATABASE_URL is not a valid URL",
    );
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => pickMigrationUrl({ POSTGRES_URL_NON_POOLING: DIRECT })).toThrow("DATABASE_URL environment variable is not set");
  });
});
