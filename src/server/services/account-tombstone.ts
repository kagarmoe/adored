// The single tombstone convention for account deletion. The user row's email,
// every photo's uploaded_by, and every accepted-invitation email the deleted
// user touched are all scrubbed to THIS value, so no surviving row links back
// to the real person. `deleted+<id>@deleted.invalid` satisfies the user.email
// unique index (per-id) and uses the reserved `.invalid` TLD (RFC 6761).
export function accountTombstone(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}
