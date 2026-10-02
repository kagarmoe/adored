export type TutorialSlug = "collection" | "sort" | "sharing";

export interface TutorialEntry {
  slug: TutorialSlug;
  title: string;
  href: `/tutorials/${TutorialSlug}`;
  description: string;
  scope: string;
}

export const TUTORIALS: readonly TutorialEntry[] = [
  {
    slug: "collection",
    title: "Start a collection",
    href: "/tutorials/collection",
    description: "Create a collection, add photos, and make items when you are ready.",
    scope: "Covers creating a collection, adding photos, and making items.",
  },
  {
    slug: "sort",
    title: "Sort and refine",
    href: "/tutorials/sort",
    description: "Sort a small sample collection: how you feel about each piece, then which you'd reach for first.",
    scope: "Complete.",
  },
  {
    slug: "sharing",
    title: "Invite and share",
    href: "/tutorials/sharing",
    description: "Invite people to a collection and share finalized results.",
    scope: "Covers how to invite people to a collection and share finalized results.",
  },
] as const;

export function getTutorial(slug: TutorialSlug): TutorialEntry {
  return TUTORIALS.find((tutorial) => tutorial.slug === slug)!;
}
