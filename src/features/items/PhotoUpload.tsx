"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { convertHeifToJpeg } from "@/lib/heic";
import {
  isHeifFile,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ERROR,
} from "@/lib/uploads";

interface PhotoUploadProps {
  itemId: string;
  collectionId: string;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Preview failed"));
    reader.readAsDataURL(file);
  });
}

export function PhotoUpload({ itemId, collectionId }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [wasConverted, setWasConverted] = useState(false);
  const [added, setAdded] = useState(false);

  // One coarse sentence for AT (purses-l5gd): progress and the successful add both
  // count as status messages under SC 4.1.3, and the visible copy for them lives only
  // in button labels — heard only if focus happens to rest there.
  const status = preparing
    ? "Preparing your photo…"
    : loading
      ? "Adding your photo…"
      : added
        ? "Photo added."
        : "";

  // Re-announce a REPEATED identical error (purses-orsx). setError(null) + setError(msg)
  // batch into one commit, so picking two non-images in a row renders byte-identical text:
  // React touches no DOM node and role="alert" never re-fires — the second rejection is
  // silent. Keying the alert on a nonce remounts it, so every rejection is announced.
  const [errorNonce, setErrorNonce] = useState(0);
  const fail = (message: string) => {
    setError(message);
    setErrorNonce((n) => n + 1);
  };

  const resetSelection = () => {
    setPreview(null);
    setSelectedFile(null);
    setWasConverted(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setAdded(false);

    if (!file.type.startsWith("image/")) {
      fail("Please select an image file");
      return;
    }

    setPreparing(true);

    try {
      const shouldConvert = isHeifFile(file);
      const uploadFile = shouldConvert ? await convertHeifToJpeg(file) : file;

      if (uploadFile.size > MAX_UPLOAD_BYTES) {
        resetSelection();
        fail(MAX_UPLOAD_ERROR);
        return;
      }

      setSelectedFile(uploadFile);
      setWasConverted(shouldConvert);
      setPreview(await readFileAsDataUrl(uploadFile));
    } catch (err) {
      resetSelection();
      fail(
        err instanceof Error
          ? err.message
          : "Could not prepare the selected image for upload"
      );
    } finally {
      setPreparing(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      fail("Please select a file");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/collections/${collectionId}/items/${itemId}/photos`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: "Failed to upload photo" }));
        throw new Error(data.error || "Failed to upload photo");
      }

      resetSelection();
      setAdded(true);
      // refresh(), not location.reload(): a hard reload tears down the document —
      // and the live region with it — before AT can read the announcement.
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-hairline rounded-lg p-8 text-center">
        {preview ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="max-h-64 mx-auto rounded"
            />
            {selectedFile && (
              <p className="text-sm text-ink-soft">
                {wasConverted ? `Converted to JPEG: ${selectedFile.name}` : selectedFile.name}
              </p>
            )}
            <div className="flex gap-2 justify-center">
              <Button onClick={handleUpload} disabled={loading || preparing}>
                {loading ? "Uploading..." : "Upload photo"}
              </Button>
              <Button
                variant="secondary"
                disabled={loading || preparing}
                onClick={() => {
                  resetSelection();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <span className="text-4xl">📸</span>
            <div>
              <label htmlFor="photo-input" className="cursor-pointer">
                <span className="font-semibold text-primary hover:text-primary-hover">
                  {preparing ? "Preparing image..." : "Click to upload"}
                </span>
              </label>
              <p className="text-sm text-ink-soft">
                PNG, JPG, GIF, HEIC, and HEIF up to 4.5MB
              </p>
            </div>
            <input
              ref={inputRef}
              id="photo-input"
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              disabled={preparing || loading}
              onClick={() => inputRef.current?.click()}
              variant="secondary"
            >
              {preparing ? "Preparing..." : "Select file"}
            </Button>
          </div>
        )}
      </div>

      {/* Mounted for the component's whole life, NOT gated on `status` (purses-l5gd):
          a live region must already exist when its text changes, or AT never observes
          the mutation — a region born with content is the classic silent-live-region bug. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* Assertive: a failed upload is a single blocking failure the user must hear.
          Keyed on errorNonce so a repeated identical error remounts the alert (purses-orsx). */}
      {error && (
        <Card
          key={errorNonce}
          role="alert"
          padding="md"
          className="bg-error-soft border border-error-soft"
        >
          <p className="text-error-deep text-sm">{error}</p>
        </Card>
      )}
    </div>
  );
}
