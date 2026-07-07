// The ONE tie-break comparator for decision-event ordering (spec §2.4, parent
// ARCH-6). createdAt (DB now(), transaction-start-fixed) first; then CODE-UNIT
// id comparison — deliberately not localeCompare (host-locale-dependent). On
// the real id corpus (prefixed lowercase ULIDs, `event_` and `evt_`) this is
// sign-identical to both comparators it replaces; the property test asserts it.
export interface Ordered {
  id: string;
  createdAt: Date;
}

export function compareByCreatedAtThenId(a: Ordered, b: Ordered): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
