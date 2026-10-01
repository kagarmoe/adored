// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { ItemPanelForm } from "./ItemPanelForm";
const item = {
  id: "i1", collectionId: "c1", name: "Tote", brand: null, style: null, color: null, material: null,
  category: null, number: 3, height: null, width: null, depth: null, weight: null, unit: "imperial",
  status: null, notes: null, story: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
} as Item;
const saved = (over: Partial<Item>) => ({ ok: true, json: async () => ({ ...item, ...over }) });
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn().mockResolvedValue(saved({ brand: "Coach" })) as never; });
describe("ItemPanelForm", () => {
  it("shows Save only once something changed, and PATCHes just the change", async () => {
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toHaveAttribute("placeholder", "Add a brand");
    await user.type(screen.getByLabelText("Brand"), "Coach");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/c1/items/i1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ brand: "Coach" }) }),
    ));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });
  it("after a save the form shows what the server kept (trimmed), with nothing left unsaved", async () => {
    global.fetch = vi.fn().mockResolvedValue(saved({ brand: "Coach" })) as never;
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.type(screen.getByLabelText("Brand"), " Coach ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("Brand")).toHaveValue("Coach"));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
  it("clears the status line once editing resumes", async () => {
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.clear(screen.getByLabelText("Name"));
    await user.tab();
    expect(screen.getByText("Give it a name to save")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Brand"), "C");
    expect(screen.queryByText("Give it a name to save")).not.toBeInTheDocument();
  });
  it("blank name reverts to the previous name with a gentle line", async () => {
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.clear(screen.getByLabelText("Name"));
    await user.tab();
    expect(screen.getByLabelText("Name")).toHaveValue("Tote");
    expect(screen.getByText("Give it a name to save")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("a failed save keeps the changes and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
    const user = userEvent.setup();
    render(<ItemPanelForm item={item} collectionId="c1" />);
    await user.type(screen.getByLabelText("Notes"), "Gift");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/didn.t save/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Notes")).toHaveValue("Gift");
  });
});
