import { describe, expect, it } from "vitest";
import { pickMigrationUrl } from "./migration-url";

const POOLED = "postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
const POOLER_HOST = "ep-cool-123-pooler.us-east-2.aws.neon.tech";
const TEST = "postgresql://postgres:test@localhost:5433/app_test";

describe("pickMigrationUrl (purses-w7ss.8)", () => {
  it("prefers the non-pooling URL when it names the same endpoint, database and user as the pooler", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: DIRECT })).toEqual({
      url: DIRECT,
      kind: "non-pooling",
      host: "ep-cool-123.us-east-2.aws.neon.tech",
    });
  });

  const fallback = (part: string) => ({
    url: POOLED,
    kind: "DATABASE_URL",
    host: POOLER_HOST,
    warning: `POSTGRES_URL_NON_POOLING points at a different ${part} than DATABASE_URL — ignoring it and migrating via DATABASE_URL`,
  });

  it("warns and falls back to DATABASE_URL on a different endpoint, without echoing credentials", () => {
    const other = "postgresql://u:secret@ep-other-999.us-east-2.aws.neon.tech/db";
    const r = pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: other });
    expect(r).toEqual(fallback("endpoint"));
    expect(r.warning).not.toMatch(/secret|ep-other|postgresql:/);
  });

  it("warns and falls back on the same endpoint but a different database", () => {
    const otherDb = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/otherdb?sslmode=require";
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherDb })).toEqual(fallback("database"));
  });

  it("warns and falls back on a different user", () => {
    const otherUser = "postgresql://admin:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherUser })).toEqual(fallback("user"));
  });

  it("warns and falls back on an unparseable non-pooling URL", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: "not a url" })).toEqual({
      url: POOLED,
      kind: "DATABASE_URL",
      host: POOLER_HOST,
      warning: "POSTGRES_URL_NON_POOLING is not a valid URL — ignoring it",
    });
  });

  it("keeps the pooled DATABASE_URL when no non-pooling URL exists", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED })).toEqual({ url: POOLED, kind: "DATABASE_URL", host: POOLER_HOST });
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
