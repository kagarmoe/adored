import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { generateId } from "@/lib/id";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const blobKey = `items/${params.itemId}/${generateId("photo")}-${file.name}`;

    const db = getDb();
    const photoRepo = new PhotoRepository(db);

    const photo = await photoRepo.create({
      itemId: params.itemId,
      blobKey,
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
