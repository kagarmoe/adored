// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MakeRevisionButton } from "./MakeRevisionButton";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderIt = () => render(<MakeRevisionButton resultId="res_1" rankingHref="/collections/bags/results" />);
const asks = (pinCount: number) => ({ ok: false, status: 409, json: async () => ({ code: "revision_discards_pins", pinCount }) });

describe("MakeRevisionButton", () => {
  it("opens the revision straight away when nothing hand-placed would move", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/collections/bags/results");
  });

  it("asks first when hand placements would be set aside, then confirms with discardPins", async () => {
    fetchMock.mockResolvedValueOnce(asks(2)).mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    const note = screen.getByText(/You've moved 2 pieces by hand on your ranking\. .*so those moves won't be kept\./);
    expect(note).toBeVisible();
    expect(note).toHaveFocus();
    expect(screen.getByRole("link", { name: "See your ranking first" })).toHaveAttribute("href", "/collections/bags/results");
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start the revision" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ discardPins: true });
    expect(push).toHaveBeenCalledWith("/collections/bags/results");
  });

  it("Keep my ranking closes the note, changes nothing, and returns focus to the button", async () => {
    fetchMock.mockResolvedValueOnce(asks(1));
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(screen.getByText(/You've moved 1 piece by hand on your ranking\. .*so that move won't be kept\./)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Keep my ranking" }));
    expect(screen.queryByText(/moved 1 piece/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a revision" })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed confirm shows the gentle error and returns focus to the button", async () => {
    fetchMock.mockResolvedValueOnce(asks(1)).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    await userEvent.click(screen.getByRole("button", { name: "Start the revision" }));
    expect(screen.getByRole("status")).toHaveTextContent(/didn't open just now/);
    expect(screen.getByRole("button", { name: "Make a revision" })).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("a 409 with any other code shows the gentle error, not the note", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "something_else" }) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(screen.getByRole("status")).toHaveTextContent(/didn't open just now/);
    expect(screen.queryByText(/by hand on your ranking/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
