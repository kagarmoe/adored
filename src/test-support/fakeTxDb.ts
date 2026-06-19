/**
 * Minimal stand-in for the `Database` handle in ROUTE/SERVICE unit tests that
 * exercise a `withTransaction(db, cb)` path. Its `.transaction(cb)` invokes the
 * callback with another `fakeTxDb()` as the "tx", so the materialization body
 * runs. Tests that mock the repo constructors (`vi.mock(... SortResultRepository
 * => mockRepo)`) get their mock repos for `new SortResultRepository(tx)`
 * regardless of the tx value, so the writes land on the mocks.
 *
 * This is NOT an atomicity proof — rollback is proven un-mocked against a real
 * DB in src/lib/db/sort-pipeline.integration.test.ts.
 */
export function fakeTxDb(): { transaction: (cb: (tx: unknown) => unknown) => unknown } {
  return {
    transaction: (cb: (tx: unknown) => unknown) => cb(fakeTxDb()),
  };
}
