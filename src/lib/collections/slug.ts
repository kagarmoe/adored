/**
 * Slugs that would shadow a STATIC route sibling of /collections/[id].
 * Next.js resolves static routes before dynamic ones, so a collection slugged
 * "new" would be unreachable. RULE: when you add a static /collections/<x>
 * route, add "<x>" here.
 */
export const RESERVED_COLLECTION_SLUGS = new Set<string>(["new"]);

const MAX_SLUG_LENGTH = 40;

/** Lowercase, hyphenate, strip non-[a-z0-9-]. Returns "" if nothing survives. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");
}
