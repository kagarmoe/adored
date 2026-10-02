import { ulid, monotonicFactory } from "ulid";

export function generateId(prefix: string): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

// Batch-insert ids: monotonic WITHIN one factory instance (base ulid() is not
// monotonic within a millisecond), preserving the `event_` + lowercase
// convention — lowercasing is order-preserving for Crockford base32, and the
// prefix keeps new ids in the same code-unit ordering regime as existing rows
// (spec §2.3.5). One factory per request/batch; never module-level shared.
export function generateOrderedIdFactory(): () => string {
  const next = monotonicFactory();
  return () => `event_${next().toLowerCase()}`;
}

/** A value shaped like one of our ids (`prefix_` + lowercase base32). URL params that
 *  name an id (`?removed=`, `?restored=`) pass this before they are used or copied. */
export function isIdShaped(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+_[0-9a-z]{1,40}$/.test(value);
}
