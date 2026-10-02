// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientKey } from "@/lib/decision-batch-schema";
import { SaveAndShare } from "./SaveAndShare";

const { refresh, drain, pendingKeys } = vi.hoisted(() => ({
  refresh: vi.fn(),
  drain: vi.fn(async () => {}),
  pendingKeys: vi.fn((): unknown[] => []),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/sorting/decisionFlusher", () => ({ drain }));
vi.mock("@/features/sorting/decisionQueue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sorting/decisionQueue")>()),
  listPendingKeysForCurator: pendingKeys,
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ resultNumber: 4, shareToken: "tok123" }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderSave = () =>
  render(<SaveAndShare collectionId="coll_1" collectionSlug="bags" curatorId="cur_1" defaultName="Bags, October 1, 2026" />);

describe("SaveAndShare (spec §4.4)", () => {
  it("names it (prefilled), saves once with a key, and shows the link", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Bags, October 1, 2026");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/ranking/save");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Bags, October 1, 2026");
    expect(ClientKey.safeParse(body.saveKey).success).toBe(true);
    expect(await screen.findByLabelText("Link to share")).toHaveValue(`${window.location.origin}/shared-results/tok123`);
    expect(screen.getByRole("link", { name: "See it saved" })).toHaveAttribute("href", "/collections/bags/results/4");
  });

  it("a retry after a stumble reuses the same key", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/nothing was lost/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Link to share");
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).saveKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("a 409 whose link is no longer active says so, and the next try is a fresh save", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "save_key_conflict" }) });
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Link to share");
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).saveKey);
    expect(keys[1]).not.toBe(keys[0]);
    expect(ClientKey.safeParse(keys[1]).success).toBe(true);
  });

  it("a 409 with nothing to save yet says so, and keeps the same key", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "nothing_to_save" }) });
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/nothing to save yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no longer active/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Link to share");
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).saveKey);
    expect(keys[1]).toBe(keys[0]);
  });

  it("lands this curator's queued answers before it saves, and refreshes the ranking after", async () => {
    const key = { curatorId: "cur_1", sessionId: "ses_1", collectionId: "coll_1" };
    pendingKeys.mockReturnValueOnce([key]);
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Link to share");
    expect(pendingKeys).toHaveBeenCalledWith("cur_1");
    expect(drain).toHaveBeenCalledWith([key]);
    expect(drain.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps focus with the person: Name on open, the opener on Not now, the Saved heading after", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByRole("button", { name: "Save and share" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Saved" })).toHaveFocus();
  });

  it("mounts its status region before there is anything to say", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("a blank name cannot be saved", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
