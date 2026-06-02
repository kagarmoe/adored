import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-ink-soft mb-6 overflow-x-auto">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2 whitespace-nowrap">
          {index > 0 && <span className="text-ink-soft">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-espresso hover:text-espresso-deep hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
