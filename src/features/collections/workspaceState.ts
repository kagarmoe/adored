// The adaptive collection workspace has exactly three shapes. Modelling them as a
// discriminated union keeps the pool-before-items precedence in one place (spec
// §8) instead of being re-derived in JSX. State is derived from the two bounded
// preview row counts — never a separate count/existence query.
export type WorkspaceState =
  | { kind: "pool-first" } // pool has rows (items optional, shown second)
  | { kind: "items-first" } // no pool rows, items has rows
  | { kind: "empty" }; // neither

export function resolveWorkspaceState(poolCount: number, itemCount: number): WorkspaceState {
  if (poolCount > 0) return { kind: "pool-first" };
  if (itemCount > 0) return { kind: "items-first" };
  return { kind: "empty" };
}
