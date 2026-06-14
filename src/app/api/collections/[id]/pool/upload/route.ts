import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { recordPooledPhoto } from "@/server/photos/recordPooledPhoto";

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 50_000_000; // client upload bypasses the 4.5MB serverless cap; keep a sane ceiling

async function assertCanAddPhotos(collectionId: string): Promise<string> {
  const session = await getSession();
  if (!session?.user) {
    throw new HttpError("Unauthorized", 401);
  }
  const db = getDb();
  const membership = await new MembershipRepository(db).findByUser(
    session.user.id,
    collectionId,
  );
  const collection = await new CollectionRepository(db).findById(collectionId);
  if (!collection) {
    throw new HttpError("Not found", 404);
  }
  const isOwner = collection.ownerId === session.user.id;
  if ((!membership || !membership.canAddPhotos) && !isOwner) {
    throw new HttpError("Forbidden", 403);
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
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
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
          mimeType: blob.contentType ?? "application/octet-stream", // defensive: SDK types contentType as non-optional
          fileSize: null, // size is not provided on the completion event
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Unexpected (DB failure, malformed body, bad/missing token payload):
    // don't leak internals; report a server error.
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
