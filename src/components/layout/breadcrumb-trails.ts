import { itemDisplayName } from "@/lib/items";

export interface Crumb {
  label: string;
  href?: string;
}

export interface TrailCollection {
  id: string;
  slug?: string | null;
  name: string;
}

export interface TrailItem {
  name: string | null;
  // Nullable to match the domain model; only feeds itemDisplayName's "#n" label.
  number: number | null;
}

export interface TrailResult {
  number: number;
  name: string;
}

const base = (c: TrailCollection) => `/collections/${c.slug ?? c.id}`;

// Linked-crumb constructors: every non-leaf level goes through one of these,
// so the back-arrow invariant (non-last crumbs always have an href) holds by
// construction. Each trail below is a parent prefix + an unlinked leaf.
const collectionsCrumb: Crumb = { label: "Collections", href: "/collections" };
const collectionPrefix = (c: TrailCollection): Crumb[] => [
  collectionsCrumb,
  { label: c.name, href: base(c) },
];
const itemsPrefix = (c: TrailCollection): Crumb[] => [
  ...collectionPrefix(c),
  { label: "Items", href: `${base(c)}/items` },
];
const decidePrefix = (c: TrailCollection): Crumb[] => [
  ...collectionPrefix(c),
  { label: "Decide", href: `${base(c)}/results` },
];

export const trail = {
  collections: (): Crumb[] => [{ label: "Collections" }],
  collectionNew: (): Crumb[] => [collectionsCrumb, { label: "Create" }],
  collection: (c: TrailCollection): Crumb[] => [collectionsCrumb, { label: c.name }],
  collectionEdit: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Edit" }],
  members: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "People" }],
  pool: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Photos" }],
  items: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Items" }],
  itemNew: (c: TrailCollection): Crumb[] => [...itemsPrefix(c), { label: "Add item" }],
  item: (c: TrailCollection, item: TrailItem): Crumb[] => [
    ...itemsPrefix(c),
    { label: itemDisplayName(item) },
  ],
  sort: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Sort" }],
  results: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Decide" }],
  result: (c: TrailCollection, result: TrailResult): Crumb[] => [
    ...decidePrefix(c),
    { label: result.name },
  ],
};
