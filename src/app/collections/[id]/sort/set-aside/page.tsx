import { redirectRetired } from "@/lib/collections/retired-redirect";

// Retired by the one Sort screen (spec 2026-10-01 §4); kept only to bounce old links.
export default async function RetiredSortSetAsidePage({ params }: { params: Promise<{ id: string }> }) {
  return redirectRetired((await params).id, "results");
}
