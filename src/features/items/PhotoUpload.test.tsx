// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Boundary mocks only. PhotoUpload does NOT use @vercel/blob/client or
// next/navigation — it POSTs a FormData multipart to the photos API and, on
// success, calls window.location.reload(). The real @/lib/uploads helpers
// (isHeifFile, MAX_UPLOAD_BYTES) are exercised, not mocked.
const { convertHeifToJpeg } = vi.hoisted(() => ({
  convertHeifToJpeg: vi.fn(async (f: File) => f),
}));
vi.mock("@/lib/heic", () => ({ convertHeifToJpeg }));

import { PhotoUpload } from "./PhotoUpload";

function jpeg(name = "bag.jpg") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

function fileInput(): HTMLInputElement {
  // The component renders a hidden <input id="photo-input" type="file">.
  return document.getElementById("photo-input") as HTMLInputElement;
}

function okResponse() {
  return { ok: true, json: async () => ({ id: "photo_1" }) };
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  convertHeifToJpeg.mockImplementation(async (f: File) => f);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
  // window.location.reload is the navigation boundary for this component.
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PhotoUpload", () => {
  it("happy path: selecting a JPEG previews it, then Upload POSTs the file and reloads", async () => {
    render(<PhotoUpload itemId="item_1" collectionId="coll_1" />);

    const file = jpeg("bag.jpg");
    fireEvent.change(fileInput(), { target: { files: [file] } });

    // After prepare, the preview + Upload control appear, and no convert ran.
    const uploadBtn = await screen.findByRole("button", { name: /upload photo/i });
    expect(convertHeifToJpeg).not.toHaveBeenCalled();
    expect(screen.getByText("bag.jpg")).toBeInTheDocument();

    fireEvent.click(uploadBtn);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    // The fetch hits the item's photos route with the File in a FormData body.
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/items/item_1/photos");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("HEIC path: a .heic file is routed through convertHeifToJpeg before upload", async () => {
    const heic = new File([new Uint8Array([9])], "trip.heic", { type: "image/heic" });
    const converted = jpeg("trip.jpg");
    convertHeifToJpeg.mockResolvedValueOnce(converted);

    render(<PhotoUpload itemId="item_1" collectionId="coll_1" />);
    fireEvent.change(fileInput(), { target: { files: [heic] } });

    const uploadBtn = await screen.findByRole("button", { name: /upload photo/i });
    expect(convertHeifToJpeg).toHaveBeenCalledTimes(1);
    expect(convertHeifToJpeg).toHaveBeenCalledWith(heic);
    // The "Converted to JPEG" affordance names the converted file.
    expect(screen.getByText(/converted to jpeg: trip\.jpg/i)).toBeInTheDocument();

    fireEvent.click(uploadBtn);
    await waitFor(() => expect(reload).toHaveBeenCalled());

    // The converted JPEG (not the original heic) is what gets uploaded.
    const body = (fetch as any).mock.calls[0][1].body as FormData;
    expect(body.get("file")).toBe(converted);
  });

  it("error path: a failed upload surfaces the API error and does NOT reload", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Storage is full" }),
    });

    render(<PhotoUpload itemId="item_1" collectionId="coll_1" />);
    fireEvent.change(fileInput(), { target: { files: [jpeg()] } });
    fireEvent.click(await screen.findByRole("button", { name: /upload photo/i }));

    // purses-orsx: the failure must land in an assertive live region, or it is
    // silent to AT users (WCAG 2.1 AA, SC 4.1.3 Status Messages).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Storage is full");
    expect(reload).not.toHaveBeenCalled();
  });

  it("rejects a non-image selection up front (no convert, no fetch)", async () => {
    render(<PhotoUpload itemId="item_1" collectionId="coll_1" />);
    const pdf = new File([new Uint8Array([1])], "receipt.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput(), { target: { files: [pdf] } });

    await waitFor(() =>
      expect(screen.getByText(/please select an image file/i)).toBeInTheDocument(),
    );
    expect(convertHeifToJpeg).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /upload photo/i })).not.toBeInTheDocument();
  });

  it("rejects a file over the size cap with the size error and no upload control", async () => {
    render(<PhotoUpload itemId="item_1" collectionId="coll_1" />);
    // 4.5MB cap (MAX_UPLOAD_BYTES) — build a File just over it.
    const big = new File([new Uint8Array(4_500_001)], "huge.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput(), { target: { files: [big] } });

    await waitFor(() =>
      expect(screen.getByText(/4\.5 MB or smaller/i)).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /upload photo/i })).not.toBeInTheDocument();
  });
});
