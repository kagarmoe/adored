// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { ImageViewer } from "./ImageViewer";

const photo = {
  id: "p1",
  itemId: "i1",
  collectionId: "c1",
  rotation: 0,
  updatedAt: new Date(1_700_000_000_000).toISOString(),
};

function img() {
  return screen.getByRole("img") as HTMLImageElement;
}

beforeEach(() => {
  mockRefresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImageViewer", () => {
  it("renders a modal dialog with the photo at the large width", () => {
    render(<ImageViewer photo={photo} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(img().getAttribute("src")).toContain("w=1280");
  });

  it("zoom in then out changes the image scale", async () => {
    const user = userEvent.setup();
    render(<ImageViewer photo={photo} onClose={() => {}} />);
    expect(img().style.transform).toContain("scale(1)");
    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(img().style.transform).toContain("scale(1.5)");
    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(img().style.transform).toContain("scale(1)");
  });

  it("rotate PATCHes the next absolute rotation, announces it, and refreshes", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ rotation: 90, updatedAt: new Date(1_700_000_001_000).toISOString() }),
    });
    render(<ImageViewer photo={photo} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /rotate photo/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/items/i1/photos/p1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ rotation: 90 }),
      }),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/rotated to 90 degrees/i));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("on rotate failure: reverts the optimistic turn and shows a gentle error", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    render(<ImageViewer photo={photo} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /rotate photo/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/couldn.t rotate/i));
    expect(img().style.transform).toContain("rotate(0deg)"); // optimistic turn reverted
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("closes via the Close button and via Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageViewer photo={photo} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
