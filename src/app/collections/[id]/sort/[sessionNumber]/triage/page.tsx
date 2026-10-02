import { redirectRetired } from "@/lib/collections/retired-redirect";

// Retired by the one Sort screen (spec 2026-10-01 §4); kept only to bounce old links.
export default async function RetiredTriagePage({ params }: { params: Promise<{ id: string; sessionNumber: string }> }) {
  return redirectRetired((await params).id, "sort");
}
