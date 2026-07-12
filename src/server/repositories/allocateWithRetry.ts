// Bounded retry for allocating a per-parent unique value (MAX+1 number, unique
// slug) with an INSERT/UPDATE that races other writers: recompute inside
// `attempt`, retry only the constraint that a fresh value can actually resolve.
// Bounded so a persistent conflict surfaces instead of looping forever.
export async function allocateWithRetry<T>(
  attempt: () => Promise<T>,
  isRetryableConflict: (error: unknown) => boolean,
  attempts = 5,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (isRetryableConflict(error) && i < attempts - 1) continue;
      throw error;
    }
  }
  // Unreachable: the final attempt either returns or throws above.
  throw new Error("allocateWithRetry: no attempts");
}
