import { describe, it, expect } from "vitest";
import {
  getPhotoAssetUrl,
  getPhotoAssetUrlForPhoto,
  getPoolPhotoAssetUrl,
  getBlobAccess,
  PHOTO_WIDTH,
} from "./photos";
import { RESIZE_WIDTHS } from "./photo-serving";

describe("photo asset URL helpers", () => {
  it("builds an item photo URL with no query when no width is given", () => {
    expect(getPhotoAssetUrl("c", "i", "p")).toBe("/api/collections/c/items/i/photos/p/file");
  });

  it("appends ?w= for an item photo when a width is given", () => {
    expect(getPhotoAssetUrl("c", "i", "p", { w: 640 })).toBe(
      "/api/collections/c/items/i/photos/p/file?w=640",
    );
  });

  it("appends ?w=&v= when both are given (cache-bust)", () => {
    expect(getPhotoAssetUrl("c", "i", "p", { w: 640, v: 7 })).toBe(
      "/api/collections/c/items/i/photos/p/file?w=640&v=7",
    );
    expect(getPoolPhotoAssetUrl("c", "p", { v: 7 })).toBe(
      "/api/collections/c/pool/photos/p/file?v=7",
    );
  });

  it("builds a pool photo URL with and without width", () => {
    expect(getPoolPhotoAssetUrl("c", "p")).toBe("/api/collections/c/pool/photos/p/file");
    expect(getPoolPhotoAssetUrl("c", "p", { w: 320 })).toBe(
      "/api/collections/c/pool/photos/p/file?w=320",
    );
  });

  it("getPhotoAssetUrlForPhoto threads width and auto-derives v from updatedAt", () => {
    expect(
      getPhotoAssetUrlForPhoto(
        { id: "p", itemId: "i", updatedAt: new Date(7) },
        "c",
        { w: 1280 },
      ),
    ).toBe("/api/collections/c/items/i/photos/p/file?w=1280&v=7");
  });

  it("getPhotoAssetUrlForPhoto throws for a pool (item-less) photo", () => {
    expect(() =>
      getPhotoAssetUrlForPhoto({ id: "p", itemId: null, updatedAt: new Date(0) }, "c"),
    ).toThrow();
  });

  it("every PHOTO_WIDTH value is an allowlisted resize width (or the route 400s it)", () => {
    for (const w of Object.values(PHOTO_WIDTH)) {
      expect(RESIZE_WIDTHS).toContain(w);
    }
  });

  it("getBlobAccess distinguishes private vs public blob hosts", () => {
    expect(getBlobAccess("https://x.private.blob.vercel-storage.com/k")).toBe("private");
    expect(getBlobAccess("https://x.public.blob.vercel-storage.com/k")).toBe("public");
  });
});
