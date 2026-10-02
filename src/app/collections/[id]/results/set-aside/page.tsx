import { redirectRetired } from "@/lib/collections/retired-redirect";

// The Set aside list lives on the Ranking now (spec §4.3); kept only to bounce old links.
export default async function RetiredSetAsidePage({ params }: { params: Promise<{ id: string }> }) {
  return redirectRetired((await params).id, "results");
}
