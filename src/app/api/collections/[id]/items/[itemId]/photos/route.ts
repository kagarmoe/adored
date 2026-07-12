import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { requireApiCapability } from "@/server/dal/collection-access";
import { generateId } from "@/lib/id";
import { put } from "@vercel/blob";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ERROR } from "@/lib/uploads";

export const MAX_SERVER_UPLOAD_BYTES = MAX_UPLOAD_BYTES;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  try {
    // Authz before existence (purses-ct0): the collection is in the URL, so a
    // non-curator never learns whether the item exists.
    // photos:write = curator — any curator may add photos (full-curator model).
    const access = await requireApiCapability(db, params.id, session.user.id, "photos:write");
    if (access instanceof NextResponse) return access;

    // Verify item belongs to collection (belongs-to-parent).
    const item = await ItemController.fromDb(db).getItem(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    if (file.size > MAX_SERVER_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: MAX_UPLOAD_ERROR },
        { status: 413 }
      );
    }

    const buffer = await file.arrayBuffer();
    const blobPath = `items/${params.itemId}/${generateId("photo")}-${file.name}`;

    const blob = await put(blobPath, buffer, {
      access: "private",
      contentType: file.type,
    });

    const photo = await PhotoController.fromDb(db).create({
      itemId: params.itemId,
      collectionId: params.id,
      blobKey: blob.url,
      filename: file.name,
      mimeType: file.type,
      fileSize: buffer.byteLength,
      uploadedBy: session.user.id,
      isHero: false,
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
