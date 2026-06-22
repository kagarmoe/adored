// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
// waitFor is used only in the real-timer skip test below.

// Boundary mocks only: @vercel/blob/client (upload), @/lib/heic (convert),
// next/navigation (router). The real @/lib/uploads helpers (partitionPoolFiles,
// isHeifFile, POOL_* limits) run un-mocked so the partition/skip logic is real.
const { upload, convertHeifToJpeg, refresh } = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ url: "https://blob.example/x.jpg" })),
  convertHeifToJpeg: vi.fn(async (f: File) => f),
  refresh: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({ upload, handleUpload: vi.fn() }));
vi.mock("@/lib/heic", () => ({ convertHeifToJpeg }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { PoolUpload } from "./PoolUpload";

function png(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

// fetchPoolCount() expects { photos: [...] } and returns photos.length (or null).
function countResponse(n: number) {
  return { ok: true, json: async () => ({ photos: new Array(n).fill({}) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ url: "https://blob.example/x.jpg" });
  convertHeifToJpeg.mockImplementation(async (f: File) => f);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PoolUpload", () => {
  it("multi-file: uploads each accepted file privately, polls until rows land, then refreshes", async () => {
    // baseline = 0, then post-upload count = 2 (>= baseline + 2 succeeded) so the
    // first poll tick satisfies waitForPooledRows and refresh fires.
    const fetch = vi.fn().mockResolvedValueOnce(countResponse(0)); // baseline
    fetch.mockResolvedValue(countResponse(2)); // every poll thereafter
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" />);
      const a = png("a.png");
      const b = png("b.png");
      fireEvent.change(fileInput(container), { target: { files: [a, b] } });

      // Flush the baseline fetch + the two sequential uploads, then advance past
      // the poll interval (1200ms) so waitForPooledRows sees the rows and
      // router.refresh() fires. Done inside act() under fake timers — testing
      // library's waitFor uses a faked setInterval here, so we drive time
      // directly instead of awaiting waitFor.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });

      expect(upload).toHaveBeenCalledTimes(2);
      // Both uploads go to the collection's pool token endpoint, access private.
      for (const call of upload.mock.calls) {
        const [name, file, opts] = call;
        expect(typeof name).toBe("string");
        expect(file).toBeInstanceOf(File);
        expect(opts).toMatchObject({
          access: "private",
          handleUploadUrl: "/api/collections/coll_9/pool/upload",
        });
      }
      expect(upload.mock.calls[0][0]).toBe("a.png");
      expect(upload.mock.calls[1][0]).toBe("b.png");

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText(/^added$/i)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pre-flight skip: an unsupported type is skipped (muted), never uploaded, no refresh", async () => {
    const fetch = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<PoolUpload collectionId="coll_9" />);
    const pdf = new File([new Uint8Array([1])], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput(container), { target: { files: [pdf] } });

    // partitionPoolFiles rejects it up front: a skip row shows, nothing uploads.
    await waitFor(() =>
      expect(screen.getByText(/isn['’]t supported yet/i)).toBeInTheDocument(),
    );
    expect(upload).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("error branch: when an upload throws, the row shows the error and refresh is NOT called", async () => {
    const fetch = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal("fetch", fetch);
    upload.mockRejectedValueOnce(new Error("token denied"));
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" />);
      fireEvent.change(fileInput(container), { target: { files: [png("a.png")] } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });

      expect(upload).toHaveBeenCalledTimes(1);
      // PINNED a11y gap (purses-orsx): the per-file error reason renders as plain
      // status text with no aria-live region, so the failure is not announced to
      // screen readers. We assert the visible text only; not fixed (test-only PR).
      expect(screen.getByText(/token denied/i)).toBeInTheDocument();
      // succeeded === 0, so waitForPooledRows/refresh never run.
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("HEIC: a .heic file is converted before upload, and the converted JPEG is what is sent", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(countResponse(0));
    fetch.mockResolvedValue(countResponse(1));
    vi.stubGlobal("fetch", fetch);
    const converted = png("trip.jpg");
    convertHeifToJpeg.mockResolvedValueOnce(converted);
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" />);
      const heic = new File([new Uint8Array([9])], "trip.heic", { type: "image/heic" });
      fireEvent.change(fileInput(container), { target: { files: [heic] } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });

      expect(convertHeifToJpeg).toHaveBeenCalledTimes(1);
      expect(convertHeifToJpeg).toHaveBeenCalledWith(heic);
      // The converted JPEG (not the raw .heic) is the file handed to upload().
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload.mock.calls[0][1]).toBe(converted);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
