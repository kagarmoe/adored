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
    <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6 overflow-x-auto">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2 whitespace-nowrap">
          {index > 0 && <span className="text-gray-400">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-blue-600 hover:text-blue-700 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
