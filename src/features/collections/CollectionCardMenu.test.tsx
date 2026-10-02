// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { CollectionCardMenu } from "./CollectionCardMenu";

const props = { collectionId: "col_1", name: "Summer bags", href: "/collections/summer-bags", q: "tote" };
const open = () => fireEvent.click(screen.getByRole("button", { name: "More for Summer bags" }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("CollectionCardMenu", () => {
  it("offers settings, members and Archive; Archive keeps the search and lands with the undo notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Collection settings", "Members", "Archive"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections?q=tote&removed=col_1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/col_1/archive", { method: "POST" });
  });

  it("in the Archived view offers Bring back, which lands on the same view with the brought-back line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<CollectionCardMenu {...props} q="" archived />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Bring back" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections?status=archived&restored=col_1"));
    expect(fetch).toHaveBeenCalledWith("/api/collections/col_1/restore", { method: "POST" });
    expect(refresh).not.toHaveBeenCalled(); // a bare refresh dropped focus with no feedback
  });

  it("a failed archive stays put and says so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn’t go through. Try again.");
    expect(push).not.toHaveBeenCalled();
  });

  it("settings and members navigate by the slug path", () => {
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Members" }));
    expect(push).toHaveBeenCalledWith("/collections/summer-bags/members");
  });
});
