import { NextResponse, type NextRequest } from "next/server";
import { serveItemPhotoFile } from "@/server/api/item-photo-file";

// sharp (used by servePhotoFile) is a native addon — pin the Node runtime.
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  const collectionId = request.nextUrl.searchParams.get("collectionId");
  const itemId = request.nextUrl.searchParams.get("itemId");

  if (!collectionId || !itemId) {
    return NextResponse.json({ error: "Missing photo scope" }, { status: 400 });
  }

  return serveItemPhotoFile(
    request,
    Promise.resolve({ id: collectionId, itemId, photoId }),
  );
}
