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
  // ── a11y live region (purses-orsx) ────────────────────────────────────────
  // The region must be MOUNTED BEFORE it has anything to say. A region that is born
  // holding its content is the classic silent-live-region bug: assistive tech only
  // announces mutations to a region it was already observing. jsdom cannot verify
  // that anything is spoken, but it CAN pin the structural precondition — and this
  // assertion is exactly what a conditionally-rendered region fails.
  it("mounts an EMPTY live region before any file is picked", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(countResponse(0)));
    render(<PoolUpload collectionId="coll_9" />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("");
  });

  it("drop-only-unsupported-files: the skip is announced, not silent", async () => {
    // The path with NO upload at all (accepted.length === 0, so the component goes
    // quiet immediately). Pre-fix this mounted the region together with its text and
    // never mutated again — the person was told nothing at all.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(countResponse(0)));
    const { container } = render(<PoolUpload collectionId="coll_9" />);
    const pdf = new File([new Uint8Array([1])], "receipt.pdf", { type: "application/pdf" });

    await act(async () => {
      fireEvent.change(fileInput(container), { target: { files: [pdf] } });
    });

    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("1 photo couldn't be added.");
  });

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

  it("attached to an item: moves exactly the rows it uploaded onto the item", async () => {
    upload.mockResolvedValueOnce({ url: "u", pathname: "a-x1.png" } as never);
    const fetch = vi.fn()
      .mockResolvedValueOnce(countResponse(1)) // baseline (someone else's pooled photo)
      .mockResolvedValueOnce(countResponse(2)) // poll: our row landed
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [
        { id: "ph_other", filename: "other.png" }, { id: "ph_ours", filename: "a-x1.png" },
      ] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ number: 4 }) }); // reassign
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" attachToItemId="item_4" />);
      fireEvent.change(fileInput(container), { target: { files: [png("a.png")] } });
      await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
      const reassign = fetch.mock.calls.find(([url]) => url === "/api/collections/coll_9/photos/reassign")!;
      expect(JSON.parse(reassign[1].body)).toEqual({ photoIds: ["ph_ours"], destination: { type: "item", itemId: "item_4" } });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/still arriving/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("attached to an item: a row that hasn't landed yet stays in the pool, and says so", async () => {
    upload.mockResolvedValueOnce({ url: "u", pathname: "a-x1.png" } as never);
    const fetch = vi.fn()
      .mockResolvedValueOnce(countResponse(0)) // baseline
      .mockResolvedValueOnce(countResponse(1)) // poll
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [] }) }); // not listed yet
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    try {
      const { container } = render(<PoolUpload collectionId="coll_9" attachToItemId="item_4" />);
      fireEvent.change(fileInput(container), { target: { files: [png("a.png")] } });
      await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
      expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/photos/reassign"))).toBe(false);
      expect(screen.getByRole("status")).toHaveTextContent(/wait in your photo pool/i);
      expect(refresh).toHaveBeenCalledTimes(1);
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
      // purses-orsx: the batch outcome is announced as ONE summary sentence in the
      // live region — not the raw thrown message, and not the per-file list (a live
      // region around the list would re-announce every filename on every transition,
      // because role="status" is implicitly aria-atomic).
      expect(screen.getByRole("status")).toHaveTextContent("1 photo couldn't be added.");

      // The machine-register throw ("token denied") must NOT reach the user — the
      // person-side sentence does. The list keeps its list semantics for browsing.
      expect(screen.queryByText(/token denied/i)).not.toBeInTheDocument();
      expect(screen.getByRole("list")).toHaveTextContent(/didn't make it/i);
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
