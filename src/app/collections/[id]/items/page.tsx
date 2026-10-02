import { redirectRetired } from "@/lib/collections/retired-redirect";
import { isIdShaped } from "@/lib/id";

type Param = string | string[] | undefined;

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, Param>>;
}

// The collection home is the items grid now (spec §5). Old links keep their view,
// query and undo notice; anything else is dropped. Only allow-listed values are
// copied (removed only when id-shaped), never interpolated raw. The guard runs
// first, inside redirectRetired.
export default async function ItemsListRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const keep = new URLSearchParams();
  if (sp.status === "archived") keep.set("status", "archived");
  if (sp.unnamed === "1") keep.set("unnamed", "1");
  if (typeof sp.q === "string" && sp.q.trim()) keep.set("q", sp.q.slice(0, 100));
  if (isIdShaped(sp.removed)) keep.set("removed", sp.removed);
  return redirectRetired(id, "", keep);
}
