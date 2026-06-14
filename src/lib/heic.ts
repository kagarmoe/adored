"use client";

import { buildJpegFileName, MAX_UPLOAD_BYTES } from "@/lib/uploads";

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decode failed"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG conversion failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export async function convertHeifToJpeg(file: File): Promise<File> {
  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let smallestBlob: Blob | null = null;

  while (true) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is unavailable for image conversion");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob;
      }
      if (blob.size <= MAX_UPLOAD_BYTES) {
        return new File([blob], buildJpegFileName(file.name), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
    if (Math.max(width, height) <= 2000) {
      break;
    }
    width *= 0.85;
    height *= 0.85;
  }
  if (!smallestBlob) {
    throw new Error("JPEG conversion failed");
  }
  return new File([smallestBlob], buildJpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
