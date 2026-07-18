import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { ShareController } from "@/server/api/shares";
import { ResultController } from "@/server/api/results";
import { ResultItemController } from "@/server/api/result-items";
import { PhotoController } from "@/server/api/photos";
import { servePhotoFile } from "@/lib/photo-serving";

// sharp (used by servePhotoFile) is a native addon — pin the Node runtime,
// same as /api/photo-files/[photoId].
export const runtime = "nodejs";

// A fresh response per call — NextResponse bodies are single-use, and this
// route is invoked once per request across the process's lifetime.
function notAvailable(): NextResponse {
  return NextResponse.json({ error: "That shared photo isn't available." }, { status: 404 });
}

/**
 * Public, token-scoped photo bytes for a shared (finalized, unrevoked) result.
 * Mirrors the shared-results page's own gating (share active + unexpired,
 * result finalized) PLUS a membership check the page doesn't need: the photo's
 * item must be one of the result's ranked result-items, so a share token can
 * never be used to fetch an unrelated photo from the same collection (spec
 * purses-21x5.1). Every gating failure collapses to the same 404 — the
 * existing `GET /api/shared-results/[token]` posture — so a stranger probing
 * the route learns nothing about which part failed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; photoId: string }> },
) {
  try {
    const { token, photoId } = await params;
    const db = getDb();

    const share = await ShareController.fromDb(db).findByToken(token);
    if (!share || share.status !== "active" || (share.expiresAt && share.expiresAt < new Date())) {
      return notAvailable();
    }

    const result = await ResultController.fromDb(db).getResultOrNull(share.sortResultId);
    if (!result || result.status !== "finalized") {
      return notAvailable();
    }

    const photo = await PhotoController.fromDb(db).findById(photoId);
    if (!photo || !photo.itemId) {
      return notAvailable();
    }

    const resultItems = await ResultItemController.fromDb(db).listResultItems(result.id);
    const isRanked = resultItems.some((ri) => ri.itemId === photo.itemId);
    if (!isRanked) {
      return notAvailable();
    }

    return servePhotoFile(
      {
        blobKey: photo.blobKey,
        mimeType: photo.mimeType,
        photoId: photo.id,
        collectionId: result.collectionId,
        updatedAt: photo.updatedAt,
        rotation: photo.rotation,
      },
      request,
    );
  } catch (error) {
    // Public route: never echo the underlying error to an unauthenticated
    // caller (same posture as GET /api/shared-results/[token]).
    console.error("shared-results photo fetch failed", error);
    return notAvailable();
  }
}
