import { buttonVariants } from "@/components/ui";
import Link from "next/link";

export type WorkspaceMode = "build" | "sort" | "decide";

// One config array so Epic 4/5 can re-point Sort/Decide in a single line.
// `path` is appended to the collection base; "" keeps Build on the workspace root.
const MODES: { mode: WorkspaceMode; label: string; path: string }[] = [
  { mode: "build", label: "Build", path: "" },
  { mode: "sort", label: "Sort", path: "/sort" },
  { mode: "decide", label: "Decide", path: "/results" },
];

interface WorkspaceModeChipsProps {
  base: string;
  activeMode: WorkspaceMode;
  /** False on section pages (Pool/Items) where the active chip links to the
   *  section root, not this page: aria-current becomes "true", not "page". */
  activeExact?: boolean;
}

// Navigation register — deliberately NOT the dominant action. The active chip
// marks a current *location* (bg-content-mid + ring, aria-current), so it never
// spends bg-primary; that single dominant treatment belongs to the adaptive
// lead/Resume action elsewhere on the workspace.
export function WorkspaceModeChips({ base, activeMode, activeExact = true }: WorkspaceModeChipsProps) {
  return (
    <nav aria-label="Workspace mode" className="flex flex-wrap gap-2">
      {MODES.map(({ mode, label, path }) => {
        const isActive = mode === activeMode;
        return (
          <Link
            key={mode}
            href={`${base}${path}`}
            aria-current={isActive ? (activeExact ? "page" : "true") : undefined}
            className={
              isActive
                ? // ghost base (never bg-primary), overpainted with the "current
                  // location" fill + a quiet ring accent.
                  `${buttonVariants({ variant: "ghost", size: "md" })} bg-content-mid text-ink ring-1 ring-primary hover:bg-content-mid`
                : buttonVariants({ variant: "ghost", size: "md" })
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
