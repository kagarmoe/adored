import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { generateId } from "@/lib/id";
import { put } from "@vercel/blob";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const itemRepo = new ItemRepository(db);
  const membershipRepo = new MembershipRepository(db);

  try {
    // Verify item belongs to collection and user has permission
    const item = await itemRepo.findById(params.itemId);
    if (!item || item.collectionId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await membershipRepo.findByUser(
      session.user.id,
      params.id
    );
    if (!membership || !membership.canAddPhotos) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const blobPath = `items/${params.itemId}/${generateId("photo")}-${file.name}`;

    // Upload to blob storage
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: file.type,
    });

    const photoRepo = new PhotoRepository(db);
    const photo = await photoRepo.create({
      itemId: params.itemId,
      blobKey: blob.url, // Store actual blob URL
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
