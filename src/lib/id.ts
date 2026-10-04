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

/** A value shaped like one of our ids (`prefix_` + lowercase base32). URL params that
 *  name an id (`?removed=`, `?restored=`) pass this before they are used or copied. */
export function isIdShaped(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+_[0-9a-z]{1,40}$/.test(value);
}
