"use client";

import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";

interface PhotoUploadProps {
  itemId: string;
  collectionId: string;
}

export function PhotoUpload({ itemId, collectionId }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!inputRef.current?.files?.[0]) {
      setError("Please select a file");
      return;
    }

    const file = inputRef.current.files[0];
    const formData = new FormData();
    formData.append("file", file);

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
        throw new Error("Failed to upload photo");
      }

      setPreview(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        {preview ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="max-h-64 mx-auto rounded"
            />
            <div className="flex gap-2 justify-center">
              <Button onClick={handleUpload} disabled={loading}>
                {loading ? "Uploading..." : "Upload Photo"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  if (inputRef.current) inputRef.current.value = "";
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
                <span className="font-semibold text-blue-600 hover:text-blue-700">
                  Click to upload
                </span>
              </label>
              <p className="text-sm text-gray-500">
                or drag and drop PNG, JPG, GIF up to 10MB
              </p>
            </div>
            <input
              ref={inputRef}
              id="photo-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              variant="secondary"
            >
              Select File
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Card padding="md" className="bg-red-50 border border-red-200">
          <p className="text-red-700 text-sm">{error}</p>
        </Card>
      )}
    </div>
  );
}
