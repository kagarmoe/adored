import React from "react";

interface ActionBarProps {
  /** Accessible name of the region, e.g. "Next step". */
  label: string;
  children: React.ReactNode;
}

// The page's one primary action (spec §5). From `md` up it is an inline row where
// the page places it; below `md` (phones) it is fixed to the bottom on glass-strong,
// AA from its own ≥0.85 opacity, never from what scrolls behind it. On a short
// viewport (browser zoom) it stays static — never a second fixed band. One DOM node
// for both, so the action is never duplicated. Pages that use it set AppLayout's
// reserveActionBar (9rem: the bar plus a two-line error) so the last row and the
// footer never sit behind it; data-action-bar drives the matching scroll padding
// (globals.css) so a focused bottom-row card scrolls clear of it. No safe-area
// padding: the root viewport is not viewportFit "cover", so the inset is always 0.
export function ActionBar({ label, children }: ActionBarProps) {
  return (
    <section
      aria-label={label}
      data-action-bar
      className="fixed inset-x-0 bottom-0 z-30 max-md:mb-0 flex items-end gap-3 border-t border-rim bg-glass-strong px-4 py-3 shadow-lift backdrop-blur-md [&>*:first-child]:flex-1 [@media(max-height:500px)]:static md:static md:z-auto md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none md:[&>*:first-child]:flex-none"
    >
      {children}
    </section>
  );
}
