/**
 * Canonical email normalization for identity comparison and storage.
 * Lowercase + trim, applied to both the write side (invitation create) and the
 * compare side (invitation accept) so the two can never drift.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
