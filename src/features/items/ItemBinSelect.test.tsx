// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ItemBinSelect } from "./ItemBinSelect";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("ItemBinSelect", () => {
  it("offers the four bins plus a not-yet placeholder, current value selected", () => {
    render(<ItemBinSelect itemId="i1" value="top" />);
    const select = screen.getByLabelText(/placed with/i) as HTMLSelectElement;
    expect(select.value).toBe("top");
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(["Not placed yet", "Love", "Like", "Maybe", "Onward"]);
  });

  it("labels are the gentle tier names but values are the rank buckets (Love → top)", () => {
    render(<ItemBinSelect itemId="i1" value={null} />);
    // The option a curator reads as "Love" writes the "top" bucket, not "Love".
    expect((screen.getByRole("option", { name: "Love" }) as HTMLOptionElement).value).toBe("top");
    expect((screen.getByRole("option", { name: "Like" }) as HTMLOptionElement).value).toBe("high");
    expect((screen.getByRole("option", { name: "Maybe" }) as HTMLOptionElement).value).toBe("medium");
    expect((screen.getByRole("option", { name: "Onward" }) as HTMLOptionElement).value).toBe("low");
  });

  it("low bin reads Onward, never Release", () => {
    render(<ItemBinSelect itemId="i1" value={null} />);
    expect(screen.getByRole("option", { name: "Onward" })).toBeInTheDocument();
    expect(screen.queryByText(/release/i)).not.toBeInTheDocument();
  });

  it("a change PUTs the item's bin (bucket value) and refreshes", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ItemBinSelect itemId="i1" value={null} />);
    fireEvent.change(screen.getByLabelText(/placed with/i), { target: { value: "top" } });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1/bin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "top" }),
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Notice uses the gentle label, not the raw bucket value.
    expect(screen.getByRole("status")).toHaveTextContent(/placed with love/i);
  });

  it("clearing back to Not placed yet PUTs bucket null", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ItemBinSelect itemId="i1" value="medium" />);
    fireEvent.change(screen.getByLabelText(/placed with/i), { target: { value: "" } });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1/bin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: null }),
      }),
    );
  });

  it("a failed save reverts the select and reassures — the prior bin still stands", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ItemBinSelect itemId="i1" value="high" />);
    const select = screen.getByLabelText(/placed with/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "low" } });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/didn.t save.*still placed with like/i),
    );
    expect(select.value).toBe("high");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("the select is disabled while a save is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => (resolveFetch = r)),
    );
    render(<ItemBinSelect itemId="i1" value={null} />);
    const select = screen.getByLabelText(/placed with/i);
    fireEvent.change(select, { target: { value: "top" } });
    expect(select).toBeDisabled();
    resolveFetch({ ok: true });
    await waitFor(() => expect(select).not.toBeDisabled());
  });
});
