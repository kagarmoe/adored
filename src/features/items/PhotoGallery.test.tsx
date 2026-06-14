// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoGallery } from "./PhotoGallery";
import type { Photo } from "@/types";
import type { MoveTarget } from "./PhotoMoveBar";

function photo(id: string, isHero = false): Photo {
  return {
    id,
    itemId: "item-1",
    collectionId: "c1",
    blobKey: `blob/${id}`,
    filename: `${id}.jpg`,
    mimeType: "image/jpeg",
    fileSize: 1234,
    uploadedBy: "u1",
    isHero,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

const PHOTOS: Photo[] = [photo("p1", true), photo("p2")];
const OTHER_ITEMS: MoveTarget[] = [{ id: "i9", number: 9, name: "Red clutch" }];

function tiles() {
  return screen.getAllByRole("button", { name: /select photo/i });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PhotoGallery move-to selection", () => {
  it("shows no move bar until a photo is selected; selecting reveals it", async () => {
    const user = userEvent.setup();
    render(
      <PhotoGallery photos={PHOTOS} itemId="item-1" collectionId="c1" otherItems={OTHER_ITEMS} />,
    );

    expect(screen.queryByRole("button", { name: /move to/i })).not.toBeInTheDocument();

    await user.click(tiles()[0]);
    expect(tiles()[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /move photos/i })).toBeInTheDocument();
  });

  it("opens the chooser with New item, Back to the pool, and a target label", async () => {
    const user = userEvent.setup();
    render(
      <PhotoGallery photos={PHOTOS} itemId="item-1" collectionId="c1" otherItems={OTHER_ITEMS} />,
    );

    await user.click(tiles()[0]);
    await user.click(screen.getByRole("button", { name: /move to/i }));

    expect(screen.getByRole("button", { name: /new item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to the pool/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /red clutch/i })).toBeInTheDocument();
  });

  it("choosing New item POSTs the right body and on success removes the tiles + confirms", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 5 }) });
    render(
      <PhotoGallery photos={PHOTOS} itemId="item-1" collectionId="c1" otherItems={OTHER_ITEMS} />,
    );

    await user.click(tiles()[1]); // p2
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/collections/c1/photos/reassign",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: ["p2"], destination: { type: "new" } }),
        }),
      ),
    );

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/their own item/i);
    // p2 removed; p1 still present
    await waitFor(() => expect(tiles()).toHaveLength(1));
  });

  it("on failure keeps the selection and shows an alert", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "gone" }) });
    render(
      <PhotoGallery photos={PHOTOS} itemId="item-1" collectionId="c1" otherItems={OTHER_ITEMS} />,
    );

    await user.click(tiles()[1]);
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t move|try again/i);
    // both tiles still present, selection kept
    expect(tiles()).toHaveLength(2);
    expect(tiles()[1]).toHaveAttribute("aria-pressed", "true");
  });
});
