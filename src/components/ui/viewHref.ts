/** A list view's URL: `path` is the list's own path; `archived` → `?status=archived`,
 *  `unnamed` → `?unnamed=1`, and a non-empty `q` is kept. */
export function viewHref(path: string, view: "all" | "archived" | "unnamed", q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (view === "unnamed") p.set("unnamed", "1");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}
