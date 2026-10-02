/**
 * Spec §4: a thin, numberless progress line — the count is for screen readers only,
 * read on demand (not live: each answer is already announced once where it lands).
 * The track's hairline edge keeps its extent visible on ground (SC 1.4.11).
 */
export function SortProgress({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div>
      <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill border border-track bg-content-soft">
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-300 ease-gentle motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="sr-only">{`${done} of ${total} placed`}</p>
    </div>
  );
}
