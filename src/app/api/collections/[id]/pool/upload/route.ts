import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { requireApiCapability } from "@/server/dal/collection-access";
import { recordPooledPhoto } from "@/server/photos/recordPooledPhoto";
import { POOL_ALLOWED_CONTENT_TYPES, POOL_MAX_BYTES } from "@/lib/uploads";

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function assertCanAddPhotos(collectionId: string): Promise<string> {
  const session = await getSession();
  if (!session?.user) {
    throw new HttpError("Unauthorized", 401);
  }
  const db = getDb();
  // photos:write = curator — any curator may upload pool photos (full-curator model).
  const access = await requireApiCapability(db, collectionId, session.user.id, "photos:write");
  if (access instanceof NextResponse) {
    throw new HttpError(access.status === 404 ? "Not found" : "Forbidden", access.status);
  }
  return session.user.id;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // User request: cookies present → authorize and capture the uploader.
        const uploadedBy = await assertCanAddPhotos(params.id);
        return {
          allowedContentTypes: [...POOL_ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: POOL_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ collectionId: params.id, uploadedBy }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Blob callback: NO session. Trust only the signed tokenPayload.
        if (!tokenPayload) {
          throw new Error("Missing token payload");
        }
        const { collectionId, uploadedBy } = JSON.parse(tokenPayload) as {
          collectionId: string;
          uploadedBy: string;
        };
        await recordPooledPhoto(new PhotoRepository(getDb()), {
          collectionId,
          uploadedBy,
          blobKey: blob.url,
          filename: blob.pathname,
          mimeType: blob.contentType ?? "application/octet-stream",
          fileSize: null,
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
