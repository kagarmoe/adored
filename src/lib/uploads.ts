export const MAX_UPLOAD_BYTES = 4_500_000;
export const MAX_UPLOAD_LABEL = "4.5 MB";
export const MAX_UPLOAD_ERROR = `Image must be ${MAX_UPLOAD_LABEL} or smaller`;

const HEIF_EXTENSIONS = /\.(heic|heif)$/i;
const HEIF_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export function isHeifFile(file: Pick<File, "name" | "type">): boolean {
  return HEIF_MIME_TYPES.has(file.type.toLowerCase()) || HEIF_EXTENSIONS.test(file.name);
}

export function buildJpegFileName(name: string): string {
  if (name.includes(".")) {
    return name.replace(/\.[^.]+$/, ".jpg");
  }
  return `${name}.jpg`;
}
