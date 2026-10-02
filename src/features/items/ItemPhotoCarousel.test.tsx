// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/pool/PoolUpload", () => ({
  PoolUpload: ({ attachToItemId }: { attachToItemId?: string }) => <p>uploader for {attachToItemId}</p>,
}));

import { ItemPhotoCarousel } from "./ItemPhotoCarousel";

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    itemId: "i1",
    collectionId: "c1",
    rotation: 0,
    updatedAt: new Date(1_700_000_000_000 + i).toISOString(),
    isHero: i === 0,
  }));

const props = { collectionId: "c1", itemId: "i1", itemName: "Bag" };

// The stage image is the only one with a non-empty alt (thumbnails are decorative).
function currentImgSrc() {
  return within(screen.getByTestId("carousel-stage")).getByRole("img").getAttribute("src") ?? "";
}

function expectCurrentPhoto(photoId: string) {
  expect(currentImgSrc()).toContain(`/api/photo-files/${photoId}?`);
}

describe("ItemPhotoCarousel", () => {
  it("shows a single photo with no nav chrome", () => {
    render(<ItemPhotoCarousel photos={mk(1)} {...props} />);
    expectCurrentPhoto("p1");
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

  it("tapping the photo opens the viewer, whose arrow keys leave the carousel alone", async () => {
    const user = userEvent.setup();
    const { container } = render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    await user.click(screen.getByRole("button", { name: /view photo/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(container).getByRole("status")).toHaveTextContent("Photo 1 of 2");
  });

  it("a swipe does not also open the viewer", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const stage = screen.getByTestId("carousel-stage");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    fireEvent.click(screen.getByRole("button", { name: /view photo/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("swipes: a leftward touch moves to the next photo, a rightward one back", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const stage = screen.getByTestId("carousel-stage");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    expectCurrentPhoto("p2");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200 }] });
    expectCurrentPhoto("p1");
  });

  it("a short touch (a tap) does not flip", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const stage = screen.getByTestId("carousel-stage");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 180 }] });
    expectCurrentPhoto("p1");
  });

  it("a mostly-vertical flick (a page scroll) does not flip", () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    const stage = screen.getByTestId("carousel-stage");
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 140, clientY: 250 }] });
    expectCurrentPhoto("p1");
  });

  it("marks the cover thumbnail visibly, not only for screen readers", () => {
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    const cover = screen.getByRole("button", { name: "Show photo 1 (cover)" }).closest("li")!;
    expect(within(cover).getByText("Cover")).toBeVisible();
  });

  it("Escape closes the delete confirm, like Keep", async () => {
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "More for photo 2" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText(/can.t be undone/i)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/can.t be undone/i)).not.toBeInTheDocument();
  });

  it("touches inside the open zoom viewer don't flip the photo behind it", async () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /view photo/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(dialog, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getAllByRole("button", { name: /go to photo/i })[0]).toHaveAttribute("aria-current", "true");
  });

  it("a thumbnail jumps to its photo", async () => {
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Show photo 3" }));
    expectCurrentPhoto("p3");
  });

  it("a single photo still gets its thumbnail strip with + Add photos", () => {
    render(<ItemPhotoCarousel photos={mk(1)} {...props} />);
    expect(screen.getByRole("button", { name: "Show photo 1 (cover)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add photos" })).toBeInTheDocument();
  });

  it("Make cover calls set-hero and moves that photo first", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(3)} {...props} />);
    expect(screen.queryAllByRole("menuitem", { name: "Make cover" })).toHaveLength(0); // menus closed
    await userEvent.click(screen.getByRole("button", { name: "More for photo 2" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Make cover" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/items/i1/photos/p2/set-hero", { method: "POST" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Show photo 1 (cover)" })).toBeInTheDocument());
    expectCurrentPhoto("p2");
  });

  it("the cover's menu offers no Make cover; Delete needs one sober confirm", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "More for photo 1" }));
    expect(screen.queryByRole("menuitem", { name: "Make cover" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/can.t be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^show photo/i })).toHaveLength(1));
    expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/items/i1/photos/p1", { method: "DELETE" });
  });

  it("deleting a photo before the one in view keeps the same photo in view", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(4)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Show photo 3" }));
    await userEvent.click(screen.getByRole("button", { name: "More for photo 1" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^show photo/i })).toHaveLength(3));
    expectCurrentPhoto("p3");
  });

  it("a failed delete keeps the photo and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    render(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "More for photo 2" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));
    expect(await screen.findByText(/didn.t go through/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^show photo/i })).toHaveLength(2);
  });

  it("no photos: a gentle empty line, no stage, and + Add photos still opens the uploader", async () => {
    render(<ItemPhotoCarousel photos={[]} {...props} />);
    expect(screen.getByText(/add photos whenever you like/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /photos of/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add photos" }));
    expect(screen.getByText("uploader for i1")).toBeInTheDocument();
  });

  it("new photos from a refresh show up without closing the uploader", async () => {
    const { rerender } = render(<ItemPhotoCarousel photos={mk(1)} {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Add photos" }));
    rerender(<ItemPhotoCarousel photos={mk(2)} {...props} />);
    expect(screen.getAllByRole("button", { name: /^show photo/i })).toHaveLength(2);
    expect(screen.getByText("uploader for i1")).toBeInTheDocument();
  });
});
