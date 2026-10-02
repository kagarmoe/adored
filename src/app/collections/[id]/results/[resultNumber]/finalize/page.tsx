import { redirectRetired } from "@/lib/collections/retired-redirect";

// Save and share replaced Finalize (spec §4.4); kept only to bounce old links.
export default async function RetiredFinalizePage({ params }: { params: Promise<{ id: string; resultNumber: string }> }) {
  return redirectRetired((await params).id, "results");
}
