export const MAX_UPLOAD_BYTES = 4_500_000;
const MAX_UPLOAD_LABEL = "4.5 MB";
export const MAX_UPLOAD_ERROR = `Image must be ${MAX_UPLOAD_LABEL} or smaller`;

/** Pool bulk-upload limits — the durable client-upload path (separate from the
 *  4.5MB serverless single-photo cap above). Mirrors the token endpoint. */
export const POOL_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export const POOL_MAX_BYTES = 50_000_000;
const POOL_MAX_LABEL = "50 MB";

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

export interface SkippedFile {
  name: string;
  reason: string;
}
export interface PoolFilePartition {
  accepted: File[];
  skipped: SkippedFile[];
}

/** Pre-flight: split selected files into those the pool endpoint will accept
 *  vs. those to skip up front (with a gentle reason), so we never upload bytes
 *  that the token endpoint would reject. HEIC/HEIF is accepted — it is converted
 *  to JPEG before upload. */
export function partitionPoolFiles(files: File[]): PoolFilePartition {
  const accepted: File[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    const typeOk =
      isHeifFile(file) ||
      (POOL_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type);
    if (!typeOk) {
      skipped.push({ name: file.name, reason: "This kind of photo isn't supported yet" });
      continue;
    }
    if (file.size > POOL_MAX_BYTES) {
      skipped.push({ name: file.name, reason: `This photo is over ${POOL_MAX_LABEL}` });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, skipped };
}
