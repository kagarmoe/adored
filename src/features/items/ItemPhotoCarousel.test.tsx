// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ItemPhotoCarousel } from "./ItemPhotoCarousel";

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    itemId: "i1",
    collectionId: "c1",
    rotation: 0,
    updatedAt: new Date(1_700_000_000_000 + i).toISOString(),
  }));

const props = { collectionId: "c1", itemName: "Bag", addPhotosHref: "/add" };

function currentImgSrc() {
  return (screen.getByRole("img") as HTMLImageElement).getAttribute("src") ?? "";
}

function expectCurrentPhoto(photoId: string) {
  expect(currentImgSrc()).toContain(`/api/photo-files/${photoId}?`);
}

describe("ItemPhotoCarousel", () => {
  it("shows an affirming add-photos CTA and no nav when there are no photos", () => {
    render(<ItemPhotoCarousel photos={[]} {...props} />);
    expect(screen.getByRole("link", { name: /add photos/i })).toHaveAttribute("href", "/add");
    expect(screen.queryByRole("button", { name: /next photo/i })).not.toBeInTheDocument();
  });

  it("shows a single photo with no nav chrome", () => {
    render(<ItemPhotoCarousel photos={mk(1)} {...props} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go to photo/i })).not.toBeInTheDocument();
  });

  it("flips to the next/previous photo via the arrow controls", async () => {
    const user = userEvent.setup();
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    expectCurrentPhoto("p1");
    await user.click(screen.getByRole("button", { name: /next photo/i }));
    expectCurrentPhoto("p2");
    await user.click(screen.getByRole("button", { name: /previous photo/i }));
    expectCurrentPhoto("p1");
  });

  it("renders dots (each a ≥44px target) up to 6 photos, with aria-current on the active one", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const dots = screen.getAllByRole("button", { name: /go to photo/i });
    expect(dots).toHaveLength(3);
    expect(dots[0].className).toMatch(/h-11/);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
  });

  it("switches to an 'N of M' counter (no dot row) beyond 6 photos", () => {
    render(<ItemPhotoCarousel photos={mk(7)} {...props} />);
    expect(screen.queryByRole("button", { name: /go to photo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^1 of 7$/)).toBeInTheDocument();
  });

  it("keeps nav buttons mounted with aria-disabled at the ends (focus never dropped)", async () => {
    const user = userEvent.setup();
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    expect(screen.getByRole("button", { name: /previous photo/i })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: /next photo/i }));
    expect(screen.getByRole("button", { name: /next photo/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /previous photo/i })).toHaveAttribute("aria-disabled", "false");
  });

  it("is itself focusable and moves with ArrowRight/ArrowLeft, announcing position", () => {
    const { container } = render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const group = screen.getByRole("group");
    group.focus();
    expect(group).toHaveFocus(); // tabIndex=0 → the carousel region is a real keyboard target
    expect(within(container).getByRole("status")).toHaveTextContent("Photo 1 of 3");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(within(container).getByRole("status")).toHaveTextContent("Photo 2 of 3");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(within(container).getByRole("status")).toHaveTextContent("Photo 1 of 3");
  });

  it("jumps to a photo when its dot is tapped", async () => {
    const user = userEvent.setup();
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    await user.click(screen.getByRole("button", { name: /go to photo 3/i }));
    expectCurrentPhoto("p3");
    const dots = screen.getAllByRole("button", { name: /go to photo/i });
    expect(dots[2]).toHaveAttribute("aria-current", "true");
    expect(dots[0]).toHaveAttribute("aria-current", "false");
  });

  it("offers the rotate/zoom view control on the current photo", () => {
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    expect(screen.getByRole("button", { name: /view photo/i })).toBeInTheDocument();
  });

  it("hides the delete control when the viewer can't delete (no 403-only button)", () => {
    render(<ItemPhotoCarousel photos={mk(2)} {...props} canDelete={false} />);
    expect(screen.queryByRole("button", { name: /delete this photo/i })).not.toBeInTheDocument();
  });

  it("drops the current photo from the carousel after a confirmed delete", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(3)} {...props} canDelete />);
    expectCurrentPhoto("p1");
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /go to photo/i })).toHaveLength(2),
    );
    expectCurrentPhoto("p2"); // p1 gone → p2 slides into view
  });

  it("deletes a MIDDLE photo — the neighbour after it slides into view", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(3)} {...props} canDelete />);
    fireEvent.click(screen.getByRole("button", { name: /next photo/i })); // → p2 (index 1)
    expectCurrentPhoto("p2");
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /go to photo/i })).toHaveLength(2),
    );
    expectCurrentPhoto("p3"); // p2 gone → p3 takes index 1
  });

  it("returns to the add-photos CTA when the last photo is deleted", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(1)} {...props} canDelete />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /add photos/i })).toBeInTheDocument(),
    );
  });
});
