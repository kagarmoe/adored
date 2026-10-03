import { describe, expect, it } from "vitest";
import { pickMigrationUrl } from "./migration-url";

const POOLED = "postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require";
const TEST = "postgresql://postgres:test@localhost:5433/app_test";

describe("pickMigrationUrl (purses-w7ss.8)", () => {
  it("prefers the non-pooling URL when DATABASE_URL is a pooler host", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: DIRECT })).toEqual({ url: DIRECT, kind: "non-pooling" });
  });

  it("keeps the pooled DATABASE_URL when no non-pooling URL exists", () => {
    expect(pickMigrationUrl({ DATABASE_URL: POOLED })).toEqual({ url: POOLED, kind: "DATABASE_URL" });
  });

  it("never lets a pulled non-pooling URL override a local/test DATABASE_URL", () => {
    expect(pickMigrationUrl({ DATABASE_URL: TEST, POSTGRES_URL_NON_POOLING: DIRECT })).toEqual({ url: TEST, kind: "DATABASE_URL" });
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => pickMigrationUrl({ POSTGRES_URL_NON_POOLING: DIRECT })).toThrow("DATABASE_URL environment variable is not set");
  });
});
