import { describe, it, expect } from "vitest";
import {
  getPhotoAssetUrl,
  getPhotoAssetUrlForPhoto,
  getPoolPhotoAssetUrl,
  getBlobAccess,
} from "./photos";

describe("photo asset URL helpers", () => {
  it("builds an item photo URL with no query when no width is given", () => {
    expect(getPhotoAssetUrl("c", "i", "p")).toBe("/api/collections/c/items/i/photos/p/file");
  });

  it("appends ?w= for an item photo when a width is given", () => {
    expect(getPhotoAssetUrl("c", "i", "p", { w: 640 })).toBe(
      "/api/collections/c/items/i/photos/p/file?w=640",
    );
  });

  it("builds a pool photo URL with and without width", () => {
    expect(getPoolPhotoAssetUrl("c", "p")).toBe("/api/collections/c/pool/photos/p/file");
    expect(getPoolPhotoAssetUrl("c", "p", { w: 320 })).toBe(
      "/api/collections/c/pool/photos/p/file?w=320",
    );
  });

  it("getPhotoAssetUrlForPhoto threads the width through", () => {
    expect(getPhotoAssetUrlForPhoto({ id: "p", itemId: "i" }, "c", { w: 1280 })).toBe(
      "/api/collections/c/items/i/photos/p/file?w=1280",
    );
  });

  it("getPhotoAssetUrlForPhoto throws for a pool (item-less) photo", () => {
    expect(() => getPhotoAssetUrlForPhoto({ id: "p", itemId: null }, "c")).toThrow();
  });

  it("getBlobAccess distinguishes private vs public blob hosts", () => {
    expect(getBlobAccess("https://x.private.blob.vercel-storage.com/k")).toBe("private");
    expect(getBlobAccess("https://x.public.blob.vercel-storage.com/k")).toBe("public");
  });
});
