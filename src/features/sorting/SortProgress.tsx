/** Spec §4: a thin, numberless progress line — the count is for screen readers only. */
export function SortProgress({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div>
      <div aria-hidden className="h-1 w-full overflow-hidden rounded-pill bg-content-soft">
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-300 ease-gentle motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="sr-only" aria-live="polite">{`${done} of ${total} placed`}</p>
    </div>
  );
}
