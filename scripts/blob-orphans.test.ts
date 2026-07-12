// findOrphans is the ONLY part of the sweep that can destroy data — a wrong
// "referenced" answer deletes a live user's photo. So it is the only part that
// earns a test; the list/query/del wiring around it is thin I/O.
import { describe, expect, it } from "vitest";
import { deleteRefusal, findOrphans, type BlobEntry, type PhotoRow } from "./blob-orphans";

const HOST = "https://store.public.blob.vercel-storage.com";
const now = new Date("2026-07-11T12:00:00Z");
const old = new Date("2026-07-01T12:00:00Z"); // well outside the 24h grace window
const recent = new Date("2026-07-11T11:50:00Z"); // 10 minutes ago

const photos: PhotoRow[] = [
  { id: "photo-live", collectionId: "coll-1", blobKey: `${HOST}/photos/live.jpg` },
];

function blob(pathname: string, uploadedAt = old): BlobEntry {
  return { pathname, url: `${HOST}/${pathname}`, size: 100, uploadedAt };
}

describe("findOrphans", () => {
  it("classifies originals and variants against the live photo rows", () => {
    const orphans = findOrphans(
      [
        blob("photos/live.jpg"), // referenced by photo-live
        blob("photos/gone.jpg"), // no row -> orphan
        blob("variants/coll-1/photo-live/w640-v1.webp"), // live photo's variant
        blob("variants/coll-1/photo-purged/w640-v1.webp"), // purged photo -> orphan
      ],
      photos,
      now,
    );

    expect(orphans.map((b) => b.pathname).sort()).toEqual([
      "photos/gone.jpg",
      "variants/coll-1/photo-purged/w640-v1.webp",
    ]);
  });

  it("never flags a blob uploaded inside the grace window (an in-flight upload has no row yet)", () => {
    const inFlight = blob("photos/uploading.jpg", recent);

    expect(findOrphans([inFlight], photos, now)).toEqual([]);
  });

  it("does not let a photo id under the WRONG collection launder a variant", () => {
    // photo-live exists, but not in coll-2 — a naive id-only check would call this live.
    const orphans = findOrphans([blob("variants/coll-2/photo-live/w640-v1.webp")], photos, now);

    expect(orphans.map((b) => b.pathname)).toEqual(["variants/coll-2/photo-live/w640-v1.webp"]);
  });
});

// The Blob store is project-wide (one token, shared across dev/preview/prod) while
// DATABASE_URL is per-environment. Point --delete at a local/empty DB and every
// production photo reads as an orphan. These are the guards that stop that.
describe("deleteRefusal", () => {
  it("refuses to delete when the DB returned no photo rows at all", () => {
    expect(deleteRefusal({ blobs: 500, photos: 0, orphans: 500 }, false)).toMatch(/no photo rows/i);
  });

  it("refuses when the orphans are an implausible share of the store", () => {
    expect(deleteRefusal({ blobs: 100, photos: 3, orphans: 60 }, false)).toMatch(/60 of 100/);
  });

  it("allows a plausible sweep", () => {
    expect(deleteRefusal({ blobs: 100, photos: 90, orphans: 5 }, false)).toBeNull();
  });

  it("lets --force override both refusals", () => {
    expect(deleteRefusal({ blobs: 500, photos: 0, orphans: 500 }, true)).toBeNull();
  });
});
