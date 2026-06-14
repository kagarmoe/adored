"use client";

import { Button } from "@/components/ui";

export function PoolActionBar({
  count,
  busy,
  onMakeItem,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMakeItem: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface-raised/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur"
      role="region"
      aria-label="Grouping actions"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <span className="text-ink-soft" aria-live="polite">
          {count} selected
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onClear}>
            Clear
          </Button>
          <Button type="button" variant="primary" className="min-h-11" disabled={busy} onClick={onMakeItem}>
            {busy ? "Making…" : "Make an item"}
          </Button>
        </div>
      </div>
    </div>
  );
}
