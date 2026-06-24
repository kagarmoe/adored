"use client";

import { useTriageUndo } from "./TriageUndoProvider";

// The persistent inline undo notice. Rendered OUTSIDE the triage page's
// `{!item ? <EmptyState/> : …}` ternary (right after the header) so it survives
// item === null — i.e. when the curator sets aside the LAST untriaged item and
// the queue empties, the "Bring back" affordance is still here. role="status"
// announces the set-aside; the decorative "·" is hidden from screen readers so
// they don't read "middle dot".
export function TriageUndoNotice() {
  const { undo, error, bringBack } = useTriageUndo();

  if (!undo && !error) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {undo && (
        <p role="status" className="text-sm text-ink-soft">
          Set aside —{" "}
          {undo.name ? <span className="text-ink">{undo.name}</span> : "this one"}{" "}
          <span aria-hidden="true">·</span>{" "}
          <button
            type="button"
            onClick={bringBack}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-sm"
          >
            Bring back
          </button>
        </p>
      )}
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
