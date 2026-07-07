// navigator.locks when available; else an in-realm promise-chain mutex per
// name (jsdom + older browsers). The cross-tab guarantee comes from
// navigator.locks in real browsers; the fallback preserves in-realm
// exclusivity only — which is exactly the pre-Web-Locks status quo.

type LockCallback = (lock: { name: string }) => Promise<unknown>;
interface LockManagerLike {
  request(name: string, callback: LockCallback): Promise<unknown>;
}

const chains = new Map<string, Promise<void>>();

export function withWebLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (
    globalThis.navigator as (Navigator & { locks?: LockManagerLike }) | undefined
  )?.locks;
  if (locks?.request) {
    return locks.request(name, () => fn()) as Promise<T>;
  }
  const prev = chains.get(name) ?? Promise.resolve();
  const run = prev.then(fn);
  // The chain must survive a rejected holder (swallow), and clean itself up
  // once no later waiter has been appended.
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(name, settled);
  void settled.then(() => {
    if (chains.get(name) === settled) chains.delete(name);
  });
  return run;
}
