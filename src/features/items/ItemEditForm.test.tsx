// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Boundary mocks only: next/navigation and fetch. ItemEditForm calls fetch
// DIRECTLY (PATCH) — there is no api-client indirection here, unlike ItemForm.
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn() }),
}));

import { ItemEditForm } from "./ItemEditForm";
import type { Item } from "@/types";

// Inputs carry a name attr but no id/htmlFor, so target by name attribute.
function field(name: string): HTMLElement {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`no field named ${name}`);
  return el as HTMLElement;
}

function baseItem(): Item {
  return {
    id: "itm_01ULID",
    number: 7,
    name: "Old Name",
    brand: "Coach",
    style: "",
    color: "",
    material: "",
    category: "",
    notes: "",
  } as Item;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("ItemEditForm", () => {
  it("PATCHes the stable ULID with the full edited form, then redirects to the catalog number", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    fireEvent.change(field("name"), { target: { value: "New Name", name: "name" } });
    fireEvent.change(field("color"), { target: { value: "Red", name: "color" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/coll_01ULID/items/7"),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    // PATCH targets the ULID; the redirect uses the human catalog number.
    expect(url).toBe("/api/collections/coll_01ULID/items/itm_01ULID");
    expect(init.method).toBe("PATCH");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("New Name");
    expect(body.color).toBe("Red");
    expect(body.brand).toBe("Coach"); // unchanged prefilled field still sent
  });

  it("a failing PATCH surfaces the error message and does NOT navigate", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(screen.getByText("Failed to update item")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("an emptied required name blocks submission — no fetch, no navigation (HTML required is the only guard)", async () => {
    // ItemEditForm has NO JS validation in handleSubmit; the sole guard is the
    // name input's HTML `required` attribute. Clearing it and clicking submit
    // triggers native constraint validation, which blocks the submit event, so
    // handleSubmit never runs and nothing is PATCHed.
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);
    fireEvent.change(field("name"), { target: { value: "", name: "name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect((field("name") as HTMLInputElement).validity.valueMissing).toBe(true);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
