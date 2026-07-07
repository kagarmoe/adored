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

// The capture mic renders a real VoiceCapture; mock only its external dependency —
// the Web Speech API — so a full capture session drives the real component. Defaults
// to unsupported so the mic is absent for every non-capture test, as it is in jsdom.
const speech = vi.hoisted(() => ({
  supported: false,
  listening: false,
  interimTranscript: "",
  finalTranscript: "",
  error: null as string | null,
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/lib/useSpeechRecognition", () => ({
  useSpeechRecognition: () => speech,
}));
vi.mock("@/lib/useReducedMotion", () => ({ useReducedMotion: () => false }));

import type { ReactElement } from "react";
import { ItemForm } from "./ItemForm";
import { VOICE_CAP_MESSAGE } from "@/lib/voice-extract-merge";
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
  speech.supported = false;
  speech.listening = false;
  speech.interimTranscript = "";
  speech.finalTranscript = "";
  speech.error = null;
  speech.start = vi.fn();
  speech.stop = vi.fn();
  // Non-capture tests: the browser exposes no speech constructor, so the capture
  // affordance stays hidden (matches jsdom / an unsupported browser).
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

// Turn the capture affordance on: a live speech constructor (opens the form's mic
// gate) plus a supported hook (renders the VoiceCapture button).
function enableVoice() {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = function () {};
  speech.supported = true;
}

// Drive one capture session through the real VoiceCapture: listening, then settling
// with a final transcript. A fresh element per rerender avoids React's same-element
// bailout so the new hook values reach the child (see VoiceCapture.test.tsx).
function speakCapture(
  rerender: (ui: ReactElement) => void,
  makeForm: () => ReactElement,
  transcript: string,
): void {
  speech.listening = true;
  rerender(makeForm());
  speech.listening = false;
  speech.finalTranscript = transcript;
  rerender(makeForm());
}

const REVIEW_HEADING = "Here's what I noted";

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
    // Governed label (spec §9): sentence-case "Add item", not Title-Case "Add Item".
    expect(screen.queryByRole("button", { name: "Add Item" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(screen.getByText("Item already exists")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("size disclosure is collapsed by default and the dimension inputs are hidden", () => {
    render(<ItemForm collectionId="coll_01ULID" mode="create" />);

    // The quiet invite is present; the inputs are not until it is opened.
    const toggle = screen.getByRole("button", { name: "Add size" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Height", { selector: "label" })).not.toBeInTheDocument();
    expect(screen.queryByText("Width", { selector: "label" })).not.toBeInTheDocument();
  });

  it("the 'Add size' toggle meets the 44px tap-target minimum", () => {
    render(<ItemForm collectionId="coll_01ULID" mode="create" />);
    const toggle = screen.getByRole("button", { name: "Add size" });
    // min-h-11 (2.75rem = 44px) keeps the quiet link a real touch target.
    expect(toggle.className).toMatch(/\bmin-h-11\b/);
  });

  it("clicking 'Add size' reveals the dimension inputs", () => {
    render(<ItemForm collectionId="coll_01ULID" mode="create" />);

    fireEvent.click(screen.getByRole("button", { name: "Add size" }));

    expect(screen.getByText("Height", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Width", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Depth", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByText("Weight", { selector: "label" })).toBeInTheDocument();
    // Now labelled "Size" and reporting expanded.
    expect(screen.getByRole("button", { name: "Size" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("auto-expands the size disclosure when the edited item already has dimensions", () => {
    const item = {
      id: "itm_01ULID",
      number: 7,
      name: "Measured Bag",
      height: "9",
      width: "11.5",
      unit: "metric",
    } as Item;

    render(<ItemForm item={item} collectionId="coll_01ULID" mode="edit" />);

    // No click needed — the loaded values force the disclosure open.
    expect(screen.getByText("Height", { selector: "label" })).toBeInTheDocument();
    expect((controlFor("Height") as HTMLInputElement).value).toBe("9");
    expect((controlFor("Width") as HTMLInputElement).value).toBe("11.5");
  });

  it("create: dimensions + unit serialize into the POST body", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "itm_01ULID", number: 42 }),
    });

    render(<ItemForm collectionId="coll_01ULID" mode="create" />);

    type("Item name", "Measured Bag");
    fireEvent.click(screen.getByRole("button", { name: "Add size" }));
    type("Height", "9");
    type("Width", "11.5");
    type("Depth", "4");
    type("Weight", "1.2");
    fireEvent.change(document.querySelector('[name="unit"]')!, {
      target: { value: "metric" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.height).toBe("9");
    expect(body.width).toBe("11.5");
    expect(body.depth).toBe("4");
    expect(body.weight).toBe("1.2");
    expect(body.unit).toBe("metric");
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
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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

describe("ItemForm — voice capture", () => {
  it("applies on-by-default suggestions into empty fields, marks them, and announces the change", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ brand: "Prada", color: "black", category: "shoulder bag" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { container, rerender } = render(make());

    speakCapture(rerender, make, "This is a black Prada shoulder bag");

    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    // The transcript is shown before anything is applied.
    expect(screen.getByText(/This is a black Prada shoulder bag/)).toBeInTheDocument();
    // Nothing has been written to the fields yet.
    expect((controlFor("Brand") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    expect((controlFor("Brand") as HTMLInputElement).value).toBe("Prada");
    expect((controlFor("Color") as HTMLInputElement).value).toBe("black");
    expect((controlFor("Category") as HTMLInputElement).value).toBe("shoulder bag");
    // Non-color provenance marker on each applied field.
    expect(screen.getAllByText("from what you said")).toHaveLength(3);
    // The one shared live region announces the change.
    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toMatch(/brand/);
    expect(region?.textContent).toMatch(/color/);
  });

  it("a replace suggestion is off by default and leaves the typed value untouched on 'Add these'", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ brand: "Gucci" }),
    });
    const item = { id: "itm_01ULID", number: 7, name: "Bag", brand: "Coach" } as Item;
    const make = () => <ItemForm item={item} collectionId="coll_01ULID" mode="edit" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "It's a Gucci");

    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    expect(screen.getByRole("checkbox", { name: /Brand — Gucci/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Add these" }));
    // The replace row was off, so the typed brand is preserved.
    expect((controlFor("Brand") as HTMLInputElement).value).toBe("Coach");
  });

  it("auto-expands the size disclosure when a dimension suggestion is applied", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ width: 11, height: 9, unit: "imperial" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    // Collapsed to start.
    expect(screen.queryByText("Width", { selector: "label" })).not.toBeInTheDocument();

    speakCapture(rerender, make, "It's 11 inches wide and 9 inches tall");
    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    // The size grid is now open with the applied values.
    expect((controlFor("Width") as HTMLInputElement).value).toBe("11");
    expect((controlFor("Height") as HTMLInputElement).value).toBe("9");
  });

  it("a failed extraction keeps the transcript and can add it to notes", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal detail that must not leak" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "a black prada bag");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add what you said to notes" }),
      ).toBeInTheDocument(),
    );
    // No review panel on failure.
    expect(screen.queryByRole("group", { name: REVIEW_HEADING })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add what you said to notes" }));
    expect((controlFor("Notes") as HTMLTextAreaElement).value).toBe("a black prada bag");
  });

  it("a 429 shows the gentle rest-for-today copy in the shared live region", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "capped" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { container, rerender } = render(make());

    speakCapture(rerender, make, "a black prada bag");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add what you said to notes" }),
      ).toBeInTheDocument(),
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toBe(VOICE_CAP_MESSAGE);
  });

  it("clears the applied marker when the person hand-edits that field", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ brand: "Prada" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "a Prada bag");
    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add these" }));
    // The marker is present on the applied field…
    expect(screen.getByText("from what you said")).toBeInTheDocument();

    // …then a hand-edit of that same field clears it (value is the person's now).
    type("Brand", "Coach");
    expect(screen.queryByText("from what you said")).not.toBeInTheDocument();
  });

  it("returns focus to the capture mic after applying suggestions", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ brand: "Prada" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "a Prada bag");
    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    expect(
      screen.getByRole("button", { name: "Add details by speaking" }),
    ).toHaveFocus();
  });

  it("returns focus to the capture mic after dismissing with 'Not now'", async () => {
    enableVoice();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ brand: "Prada" }),
    });
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "a Prada bag");
    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(
      screen.getByRole("button", { name: "Add details by speaking" }),
    ).toHaveFocus();
  });

  it("single-flight — a second utterance during an in-flight request is ignored", async () => {
    enableVoice();
    // A never-settling request holds the flight open.
    (fetch as any).mockReturnValue(new Promise(() => {}));
    const make = () => <ItemForm collectionId="coll_01ULID" mode="create" />;
    const { rerender } = render(make());

    speakCapture(rerender, make, "first");
    speakCapture(rerender, make, "second");

    const extractCalls = (fetch as any).mock.calls.filter(
      (c: any[]) => c[0] === "/api/voice/extract",
    );
    expect(extractCalls).toHaveLength(1);
  });
});
