// jsdom here does not expose a working localStorage on file:// URLs (see
// StartSessionForm.test / round-preference.test). Install a minimal Map-backed
// Storage so dismissal assertions run against a real getItem/setItem round-trip.
export function installStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    },
    configurable: true,
  });
}
