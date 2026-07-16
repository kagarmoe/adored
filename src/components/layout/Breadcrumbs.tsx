import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

// Identical params to the carousel chevron so the two glyphs read as one family.
function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  // The back arrow always targets the parent crumb (second-to-last), never
  // browser history; it needs >=2 crumbs and a linkable parent to exist.
  const parent = items.length >= 2 ? items[items.length - 2] : undefined;
  const backHref = parent?.href;

  return (
    // The crumb list scrolls in its own wrapper below: overflow on the nav
    // itself would clip the back link's 44px hit area to the ~20px row.
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-ink-soft mb-6">
      {parent && backHref && (
        <>
          {/* Tablet: pointer-only shortcut — the parent crumb link is the
              accessible/keyboard path, so a second tab stop would be noise.
              Negative margins keep the 44px hit area from changing row height
              and optically align the glyph with the content edge. */}
          <Link
            href={backHref}
            aria-hidden="true"
            tabIndex={-1}
            className="hidden sm:flex h-11 w-11 -my-3 -ml-4 items-center justify-center text-primary hover:text-primary-hover"
          >
            <BackChevron />
          </Link>
          {/* Phone: the trail collapses to this single fully accessible link. */}
          <Link
            href={backHref}
            aria-label={`Back to ${parent.label}`}
            className="flex sm:hidden min-h-11 -my-3 -ml-2 items-center gap-1 rounded-control text-primary hover:text-primary-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            <BackChevron />
            <span className="truncate max-w-[70vw] pr-2">{parent.label}</span>
          </Link>
        </>
      )}
      <div
        className={`${backHref ? "hidden sm:flex" : "flex"} items-center gap-2 overflow-x-auto`}
      >
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2 whitespace-nowrap">
            {index > 0 && <span className="text-ink-soft">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="text-primary hover:text-primary-hover hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-ink font-medium">{item.label}</span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
