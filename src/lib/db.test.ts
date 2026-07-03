import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// The dev-only Drizzle query logger is gated on DB_QUERY_LOG=1 — OFF by default
// (it logs every query's SQL AND param VALUES, which is PII, and is noisy).
// This light test proves the gating expression: unset/other → false, "1" → true.
// We mock drizzle so we can inspect the { logger } option it's called with,
// and reset modules between cases (db.ts caches the client at module load).

const { mockDrizzle, mockPostgres } = vi.hoisted(() => ({
  mockDrizzle: vi.fn(() => ({})),
  mockPostgres: vi.fn(() => ({})),
}));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mockDrizzle }));
vi.mock("postgres", () => ({ default: mockPostgres }));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  mockDrizzle.mockClear();
  mockPostgres.mockClear();
  process.env = { ...ORIGINAL_ENV, DATABASE_URL: "postgres://u:p@localhost:5432/adored" };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

async function loggerOption(): Promise<unknown> {
  await import("./db");
  return (mockDrizzle.mock.calls[0][1] as { logger?: unknown }).logger;
}

describe("db.ts — Drizzle query logger gating", () => {
  it("logger is OFF when DB_QUERY_LOG is unset", async () => {
    delete process.env.DB_QUERY_LOG;
    expect(await loggerOption()).toBe(false);
  });

  it("logger is OFF when DB_QUERY_LOG is any value other than '1'", async () => {
    process.env.DB_QUERY_LOG = "true";
    expect(await loggerOption()).toBe(false);
  });

  it("logger is ON only when DB_QUERY_LOG === '1'", async () => {
    process.env.DB_QUERY_LOG = "1";
    expect(await loggerOption()).toBe(true);
  });
});

describe("db.ts — statement_timeout on the postgres-js client", () => {
  async function connectionOptions(): Promise<{ statement_timeout?: unknown } | undefined> {
    await import("./db");
    // postgres(connectionString, options) — the client options are the 2nd arg.
    const opts = mockPostgres.mock.calls[0][1] as { connection?: { statement_timeout?: unknown } };
    return opts?.connection;
  }

  // A generous cap UNDER the 30s Vercel function budget: a pathological query
  // fails fast as SQLSTATE 57014 (classified `statement_timeout` by logDbError)
  // instead of silently eating the whole function budget. Normal recomputes are
  // tens of ms — nowhere near this — so this never trips the hot path.
  it("sets a 25s statement_timeout via the connection option", async () => {
    delete process.env.DB_QUERY_LOG;
    const connection = await connectionOptions();
    expect(connection?.statement_timeout).toBe(25_000);
  });

  it("is comfortably under the 30s Vercel function cap", async () => {
    const connection = await connectionOptions();
    expect(connection?.statement_timeout as number).toBeLessThan(30_000);
  });
});
