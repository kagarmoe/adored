// DAL capability map: role model core (purses-89g).
// ownerId is the SOLE owner source; membership.role is a display label only.

export type Role = "owner" | "curator";

export type Operation =
  | "collection:read"
  | "collection:manage"
  | "collection:purge"
  | "collection:audit"
  | "members:read"
  | "members:manage"
  | "invitations:read"
  | "invitations:manage"
  | "items:read"
  | "items:write"
  | "items:purge"
  | "photos:write"
  | "sessions:write"
  | "preferences:write";

// Compile-exhaustive map: every Operation has a minimum required Role.
// owner satisfies all operations; curator satisfies only curator-level ones.
export const CAPABILITIES: Record<Operation, Role> = {
  "collection:read": "curator",
  "members:read": "curator",
  "items:read": "curator",
  "items:write": "curator",
  "photos:write": "curator",
  "sessions:write": "curator",
  "preferences:write": "curator",
  "invitations:read": "owner",
  "collection:manage": "owner",
  "collection:purge": "owner",
  "collection:audit": "owner",
  "members:manage": "owner",
  "invitations:manage": "owner",
  "items:purge": "owner",
};

// owner satisfies every role (including owner); curator satisfies curator only.
export function roleSatisfies(effective: Role, required: Role): boolean {
  return effective === "owner" || effective === required;
}

// Resolve the caller's effective role for a collection.
// collection.ownerId is canonical and sole — membership.role is never read here.
// Returns "owner" if the caller is the collection owner, "curator" if they have
// a membership row, null if they are not a member at all.
export function resolveEffectiveRole(
  collection: { ownerId: string },
  membership: { id: string } | null,
  userId: string,
): Role | null {
  if (collection.ownerId === userId) return "owner";
  if (membership) return "curator";
  return null;
}
