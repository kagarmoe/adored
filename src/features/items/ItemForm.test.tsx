// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Boundary mocks only: next/navigation (router push/back) and fetch. ItemForm
// submits through the REAL @/lib/api-client (apiPost/apiPatch) and the REAL zod
// schema — those are exercised, not mocked. Mocking fetch lets us assert the
// exact request the api-client builds.
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn() }),
}));

import { ItemForm } from "./ItemForm";
import type { Item } from "@/types";

// Inputs in ItemForm carry no id/name/htmlFor, so getByLabelText cannot link
// them. The wrapper renders <label>{text}</label> followed by the control as
// siblings; grab the control that follows the label text.
function controlFor(labelText: string): HTMLElement {
  const label = screen.getByText(labelText, { selector: "label" });
  const control = label.parentElement?.querySelector("input, textarea");
  if (!control) throw new Error(`no control for label ${labelText}`);
  return control as HTMLElement;
}

function type(labelText: string, value: string) {
  fireEvent.change(controlFor(labelText), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("ItemForm", () => {
  it("create: POSTs the typed fields to the collection items route, then redirects to the assigned catalog number", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "itm_01ULID", number: 42 }),
    });

    render(<ItemForm collectionId="coll_01ULID" mode="create" />);

    type("Item name", "Hobo Bag");
    type("Brand", "Coach");
    type("Color", "Tan");
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/coll_01ULID/items/42"),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/collections/coll_01ULID/items");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Hobo Bag");
    expect(body.brand).toBe("Coach");
    expect(body.color).toBe("Tan");
    // Untouched optional fields go out as empty strings (zod .optional() keeps them).
    expect(body.style).toBe("");
  });

  it("create: a blank required name blocks submission — no fetch, no navigation", async () => {
    // The Item name input carries HTML `required`. Clicking submit with it empty
    // triggers native constraint validation, which blocks the submit event, so
    // handleSubmit never runs. (The zod `name` guard inside handleSubmit is a
    // redundant backstop that is unreachable via normal UI submission.)
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<ItemForm collectionId="coll_01ULID" mode="create" />);
    // Leave Item name empty; submit.
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    // The required field reports invalid and nothing is sent.
    expect((controlFor("Item name") as HTMLInputElement).validity.valueMissing).toBe(true);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("create: a failing API response surfaces the server error and does NOT navigate", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Item already exists" }),
    });

    render(<ItemForm collectionId="coll_01ULID" mode="create" />);
    type("Item name", "Hobo Bag");
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    await waitFor(() =>
      expect(screen.getByText("Item already exists")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("edit: PATCHes the stable ULID with the changed fields, then redirects to the catalog number", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const item = {
      id: "itm_01ULID",
      number: 7,
      name: "Old Name",
      brand: "Coach",
    } as Item;

    render(<ItemForm item={item} collectionId="coll_01ULID" mode="edit" />);

    type("Item name", "New Name");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/coll_01ULID/items/7"),
    );

    const [url, init] = (fetch as any).mock.calls[0];
    // PATCH targets the ULID, not the catalog number.
    expect(url).toBe("/api/collections/coll_01ULID/items/itm_01ULID");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body).name).toBe("New Name");
  });
});
