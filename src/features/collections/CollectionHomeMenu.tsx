"use client";

import { useRouter } from "next/navigation";
import { OverflowMenu, type OverflowMenuItem } from "@/components/ui";

// The home's rarer actions (PRODUCT "Familiar first"): every member can add an
// item by hand; settings and members are the owner's (each page is server-gated too).
export function CollectionHomeMenu({ href, name, isOwner }: { href: string; name: string; isOwner: boolean }) {
  const router = useRouter();
  const items: OverflowMenuItem[] = [
    { label: "Add item", onSelect: () => router.push(`${href}/items/new`) },
    ...(isOwner
      ? [
          { label: "Collection settings", onSelect: () => router.push(`${href}/edit`) },
          { label: "Members", onSelect: () => router.push(`${href}/members`) },
        ]
      : []),
  ];
  return <OverflowMenu label={`More for ${name}`} items={items} />;
}
