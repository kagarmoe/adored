"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface OverflowMenuProps {
  /** Accessible name of the ··· trigger, e.g. "More for photo 2". */
  label: string;
  items: OverflowMenuItem[];
  className?: string;
  /** A 28px visible chip inside the 44px hit area, for small surfaces (a thumbnail). */
  compact?: boolean;
}

const MENU_WIDTH = 192; // w-48
const GAP = 4;
const EDGE = 8;

/** A ··· button that opens a small action menu. The menu is portalled to <body> with
 *  fixed positioning, so a scrolling or clipping ancestor (a thumbnail strip) never
 *  cuts it off. Keyboard: opens on the first item, ArrowUp/Down/Home/End move,
 *  Escape closes back to the trigger; Tab or a tap outside closes. */
export function OverflowMenu({ label, items, className, compact = false }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - EDGE));
    const roughHeight = items.length * 44 + 16;
    setPos(
      r.bottom + GAP + roughHeight > window.innerHeight && r.top > roughHeight
        ? { bottom: window.innerHeight - r.top + GAP, left }
        : { top: r.bottom + GAP, left },
    );
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
    };
    // Fixed position goes stale once anything scrolls; closing is simpler than tracking.
    const onScrollOrResize = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, pos]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const at = els.indexOf(document.activeElement as HTMLElement);
    const moveTo = (i: number) => els[(i + els.length) % els.length]?.focus();
    // Stop handled keys here: React bubbles portal events to the trigger's ancestors
    // (e.g. a carousel that also listens for arrow keys).
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown") moveTo(at + 1);
    else if (e.key === "ArrowUp") moveTo(at - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(els.length - 1);
    else if (e.key === "Tab") return close(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`group inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${compact ? "" : "border border-rim bg-glass hover:bg-glass-strong"} ${className ?? ""}`}
      >
        <span
          aria-hidden
          className={
            compact
              ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink-soft bg-surface-raised text-sm leading-none shadow-lift transition-colors group-hover:bg-surface"
              : "text-lg leading-none"
          }
        >
          ···
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ position: "fixed", width: MENU_WIDTH, ...pos, visibility: pos ? "visible" : "hidden" }}
            className="z-50 space-y-1 rounded-card bg-surface-raised p-2 shadow-raised ring-1 ring-hairline"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
                className={`flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm hover:bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${item.tone === "danger" ? "text-error-deep" : "text-ink"}`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
