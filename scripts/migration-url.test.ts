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

  it("refuses a non-pooling URL on a different endpoint, without echoing credentials", () => {
    const other = "postgresql://u:secret@ep-other-999.us-east-2.aws.neon.tech/db";
    expect(() => pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: other })).toThrow(
      "POSTGRES_URL_NON_POOLING points at a different endpoint than DATABASE_URL — refusing to migrate",
    );
    try {
      pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: other });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/secret|ep-other|postgresql:/);
    }
  });

  it("refuses a non-pooling URL on the same endpoint but a different database", () => {
    const otherDb = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/otherdb?sslmode=require";
    expect(() => pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherDb })).toThrow(
      "POSTGRES_URL_NON_POOLING points at a different database than DATABASE_URL — refusing to migrate",
    );
  });

  it("refuses a non-pooling URL with a different user", () => {
    const otherUser = "postgresql://admin:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
    expect(() => pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: otherUser })).toThrow(
      "POSTGRES_URL_NON_POOLING points at a different user than DATABASE_URL — refusing to migrate",
    );
  });

  it("refuses an unparseable non-pooling URL on a pooler host", () => {
    expect(() => pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: "not a url" })).toThrow(
      "POSTGRES_URL_NON_POOLING is not a valid URL",
    );
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
