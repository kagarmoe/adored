// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/features/sorting/decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { KeepSortingButton } from "./KeepSortingButton";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "sess_new" }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const renderButton = (session: { id: string; status: "active" | "paused" } | null) =>
  render(<KeepSortingButton collectionId="coll_1" curatorId="u1" sortHref="/collections/bags/sort" session={session} />);

describe("KeepSortingButton (spec §4.1)", () => {
  it("with no sort open: Start sorting creates one, then opens the sort", async () => {
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    // Start sorting lives on the sort URL itself; a same-URL push alone may not re-render it.
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ method: "POST", body: JSON.stringify({ collectionId: "coll_1" }) }));
  });

  it("a paused sort: Keep sorting reactivates it first", async () => {
    renderButton({ id: "sess_1", status: "paused" });
    await userEvent.click(screen.getByRole("button", { name: "Keep sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/sess_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "active" }) }));
  });

  it("an active sort: Keep sorting just opens it", async () => {
    renderButton({ id: "sess_1", status: "active" });
    await userEvent.click(screen.getByRole("button", { name: "Keep sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a sort opened elsewhere (409) is simply joined", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
  });

  it("a failure says so gently and stays put", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    expect(await screen.findByRole("status")).toHaveTextContent("That didn't go through — give it another try in a moment.");
    expect(push).not.toHaveBeenCalled();
  });

  it("while it opens, a double tap sends one request and the busy state is announced", async () => {
    let finish: (r: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderButton(null);
    const button = screen.getByRole("button", { name: "Start sorting" });
    fireEvent.click(button);
    fireEvent.click(button);
    const busy = await screen.findByRole("button", { name: "Just a moment…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    finish({ ok: true, status: 201, json: async () => ({ id: "sess_new" }) });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
