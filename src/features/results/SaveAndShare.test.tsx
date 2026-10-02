// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientKey } from "@/lib/decision-batch-schema";
import { SaveAndShare } from "./SaveAndShare";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ resultNumber: 4, shareToken: "tok123" }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderSave = () => render(<SaveAndShare collectionId="coll_1" collectionSlug="bags" defaultName="Bags, October 1, 2026" />);

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

  it("a blank name cannot be saved", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
