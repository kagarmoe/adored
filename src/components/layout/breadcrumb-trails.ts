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
  // Nullable to match the domain model; item routes fetch by number, so it is
  // present in practice. A null number just drops the crumb's link (and with
  // it the back arrow) instead of minting a broken href.
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
const itemPrefix = (c: TrailCollection, item: TrailItem): Crumb[] => [
  ...itemsPrefix(c),
  {
    label: itemDisplayName(item),
    ...(item.number != null ? { href: `${base(c)}/items/${item.number}` } : {}),
  },
];
const sortPrefix = (c: TrailCollection): Crumb[] => [
  ...collectionPrefix(c),
  { label: "Sort", href: `${base(c)}/sort` },
];
const sessionPrefix = (c: TrailCollection, sessionNumber: number): Crumb[] => [
  ...sortPrefix(c),
  { label: "Session", href: `${base(c)}/sort/${sessionNumber}` },
];
const decidePrefix = (c: TrailCollection): Crumb[] => [
  ...collectionPrefix(c),
  { label: "Decide", href: `${base(c)}/results` },
];
const resultPrefix = (c: TrailCollection, result: TrailResult): Crumb[] => [
  ...decidePrefix(c),
  { label: result.name, href: `${base(c)}/results/${result.number}` },
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
  itemEdit: (c: TrailCollection, item: TrailItem): Crumb[] => [
    ...itemPrefix(c, item),
    { label: "Edit" },
  ],
  itemPhotos: (c: TrailCollection, item: TrailItem): Crumb[] => [
    ...itemPrefix(c, item),
    { label: "Photos" },
  ],
  sort: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Sort" }],
  sortNew: (c: TrailCollection): Crumb[] => [...sortPrefix(c), { label: "New session" }],
  setAside: (c: TrailCollection): Crumb[] => [...sortPrefix(c), { label: "Set aside" }],
  // _sessionNumber keeps the (c, n) arity of the other session-scoped builders;
  // the Session leaf itself is the current page, so it carries no href.
  session: (c: TrailCollection, _sessionNumber: number): Crumb[] => [
    ...sortPrefix(c),
    { label: "Session" },
  ],
  triage: (c: TrailCollection, sessionNumber: number): Crumb[] => [
    ...sessionPrefix(c, sessionNumber),
    { label: "Triage" },
  ],
  compare: (c: TrailCollection, sessionNumber: number): Crumb[] => [
    ...sessionPrefix(c, sessionNumber),
    { label: "Compare" },
  ],
  usage: (c: TrailCollection, sessionNumber: number): Crumb[] => [
    ...sessionPrefix(c, sessionNumber),
    { label: "Usage" },
  ],
  results: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Decide" }],
  result: (c: TrailCollection, result: TrailResult): Crumb[] => [
    ...decidePrefix(c),
    { label: result.name },
  ],
  finalize: (c: TrailCollection, result: TrailResult): Crumb[] => [
    ...resultPrefix(c, result),
    { label: "Finalize" },
  ],
};
