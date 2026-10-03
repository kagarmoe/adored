import { monotonicFactory } from "ulid";

// One process-wide monotonic factory: base ulid() randomizes within a millisecond,
// and items/collections carry JS-ms createdAt, so same-ms rows tied and
// compareByCreatedAtThenId ordered them by chance (purses-w7ss.16). Monotonic
// within this process only — rows minted concurrently on two instances stay
// unordered, which is honest: they were concurrent.
const nextUlid = monotonicFactory();

export function generateId(prefix: string): string {
  return `${prefix}_${nextUlid().toLowerCase()}`;
}

// Batch-insert ids: monotonic WITHIN one factory instance (base ulid() is not
// monotonic within a millisecond), preserving the `event_` + lowercase
// convention — lowercasing is order-preserving for Crockford base32, and the
// prefix keeps new ids in the same code-unit ordering regime as existing rows
// (spec §2.3.5). One factory per request/batch; generateId's process-wide factory gives no per-batch guarantee across instances.
export function generateOrderedIdFactory(): () => string {
  const next = monotonicFactory();
  return () => `event_${next().toLowerCase()}`;
}

/** A value shaped like one of our ids (`prefix_` + lowercase base32). URL params that
 *  name an id (`?removed=`, `?restored=`) pass this before they are used or copied. */
export function isIdShaped(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+_[0-9a-z]{1,40}$/.test(value);
}
