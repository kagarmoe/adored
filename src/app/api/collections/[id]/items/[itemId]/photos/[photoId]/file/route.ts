import { type NextRequest } from "next/server";
import { serveItemPhotoFile } from "@/server/api/item-photo-file";

// sharp (used by servePhotoFile) is a native addon — pin the Node runtime.
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; photoId: string }> }
) {
  return serveItemPhotoFile(request, params);
}
