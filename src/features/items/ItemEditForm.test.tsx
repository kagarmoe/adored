// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Boundary mocks only: next/navigation and fetch. ItemEditForm submits via fetch
// DIRECTLY (PATCH) and calls the REAL @/lib/api-client (apiPost) for extraction —
// both hit the mocked fetch, so we assert the exact requests.
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn() }),
}));

// The form renders TWO real VoiceCapture instances in JSX order: the structured
// capture mic (top) then the story mic (by the story field). Mock only their shared
// dependency — the Web Speech API — handing each instance its OWN state, so driving
// one mic never triggers the other. Both hooks run every render (VoiceCapture calls
// the hook before self-hiding), so the even/odd slot split stays stable per render.
const voice = vi.hoisted(() => {
  const make = () => ({
    supported: false,
    listening: false,
    interimTranscript: "",
    finalTranscript: "",
    error: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
  });
  return { capture: make(), story: make(), slot: 0 };
});
vi.mock("@/lib/useSpeechRecognition", () => ({
  useSpeechRecognition: () =>
    voice.slot++ % 2 === 0 ? voice.capture : voice.story,
}));
vi.mock("@/lib/useReducedMotion", () => ({ useReducedMotion: () => false }));

import type { ReactElement } from "react";
import { ItemEditForm } from "./ItemEditForm";
import { STORY_LIMIT_MESSAGE, STORY_MAX_LENGTH } from "@/lib/voice-dictation";
import { VOICE_CAP_MESSAGE } from "@/lib/voice-extract-merge";
import type { Item } from "@/types";

const capture = voice.capture;
const story = voice.story;
const REVIEW_HEADING = "Here's what I noted";

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
    story: "",
  } as Item;
}

function reset(s: typeof voice.capture) {
  s.supported = false;
  s.listening = false;
  s.interimTranscript = "";
  s.finalTranscript = "";
  s.error = null;
  s.start = vi.fn();
  s.stop = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  reset(capture);
  reset(story);
  voice.slot = 0;
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

// Open the structured-capture affordance: a live speech constructor (the form's mic
// gate + invite) plus a supported capture hook (renders that mic's button).
function enableCapture() {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = function () {};
  capture.supported = true;
}

// Drive one session on a specific mic's state through the real VoiceCapture: listening,
// then settling with a final transcript. A fresh element per rerender avoids React's
// same-element bailout so the new hook values reach the child.
function drive(
  s: typeof voice.capture,
  rerender: (ui: ReactElement) => void,
  makeForm: () => ReactElement,
  transcript: string,
): void {
  s.listening = true;
  rerender(makeForm());
  s.listening = false;
  s.finalTranscript = transcript;
  rerender(makeForm());
}

function storyValue(): string {
  return (field("story") as HTMLTextAreaElement).value;
}

describe("ItemEditForm", () => {
  it("PATCHes the stable ULID with the full edited form, then redirects to the catalog number", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    fireEvent.change(field("name"), { target: { value: "New Name", name: "name" } });
    fireEvent.change(field("color"), { target: { value: "Red", name: "color" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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

  it("renders the forward-framed Story textarea and includes an edited story in the PATCH body (Epic 2)", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    const story = field("story");
    expect(story.tagName).toBe("TEXTAREA");
    // Forward-framed label — asked before, kept after (see keepsake card on detail).
    expect(screen.getByText(/where will it go next\?/i)).toBeInTheDocument();

    fireEvent.change(story, {
      target: { value: "To my niece, who borrowed it.", name: "story" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.story).toBe("To my niece, who borrowed it.");
  });

  it("size disclosure is collapsed by default, then expands on click", () => {
    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    const toggle = screen.getByRole("button", { name: "Add size" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector('[name="height"]')).toBeNull();

    fireEvent.click(toggle);

    expect(document.querySelector('[name="height"]')).not.toBeNull();
    expect(document.querySelector('[name="width"]')).not.toBeNull();
    expect(document.querySelector('[name="depth"]')).not.toBeNull();
    expect(document.querySelector('[name="weight"]')).not.toBeNull();
    expect(document.querySelector('[name="unit"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Size" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("auto-expands the size disclosure when the item already has dimensions", () => {
    const item = { ...baseItem(), height: "9", width: "11.5", unit: "metric" } as Item;
    render(<ItemEditForm item={item} collectionId="coll_01ULID" />);

    // Open without a click — loaded values force it.
    expect((field("height") as HTMLInputElement).value).toBe("9");
    expect((field("width") as HTMLInputElement).value).toBe("11.5");
  });

  it("dimensions + unit serialize into the PATCH body", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    fireEvent.click(screen.getByRole("button", { name: "Add size" }));
    fireEvent.change(field("height"), { target: { value: "9", name: "height" } });
    fireEvent.change(field("width"), { target: { value: "11.5", name: "width" } });
    fireEvent.change(field("depth"), { target: { value: "4", name: "depth" } });
    fireEvent.change(field("weight"), { target: { value: "1.2", name: "weight" } });
    fireEvent.change(field("unit"), { target: { value: "metric", name: "unit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.height).toBe("9");
    expect(body.width).toBe("11.5");
    expect(body.depth).toBe("4");
    expect(body.weight).toBe("1.2");
    expect(body.unit).toBe("metric");
  });

  it("offers a story mic and a details-capture mic — but never one bolted onto notes", () => {
    enableCapture();
    story.supported = true;
    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);

    expect(
      screen.getByRole("button", { name: "Speak your story" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add details by speaking" }),
    ).toBeInTheDocument();
    // Exactly two voice toggles — a third would mean a mic was added to notes.
    expect(screen.getAllByRole("button", { name: /speak/i })).toHaveLength(2);
  });

  it("dictation appends to the story with a separating space", () => {
    story.supported = true;
    const item = { ...baseItem(), story: "It was my mother's." } as Item;
    const makeForm = () => <ItemEditForm item={item} collectionId="coll_01ULID" />;
    const { rerender } = render(makeForm());

    drive(story, rerender, makeForm, "She loved it too.");

    expect(storyValue()).toBe("It was my mother's. She loved it too.");
  });

  it("clamps dictation at exactly 2000 chars and shows + announces the limit copy", () => {
    story.supported = true;
    const item = { ...baseItem(), story: "a".repeat(1990) } as Item;
    const makeForm = () => <ItemEditForm item={item} collectionId="coll_01ULID" />;
    const { container, rerender } = render(makeForm());

    // 1990 + 1 separator + 20 = 2011 → trimmed back to the cap.
    drive(story, rerender, makeForm, "b".repeat(20));

    expect(storyValue()).toHaveLength(STORY_MAX_LENGTH);
    // Shown and announced through the story mic's polite live region (the only one:
    // the capture mic stays unsupported here, so it renders no region).
    expect(screen.getByText(STORY_LIMIT_MESSAGE)).toBeInTheDocument();
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).toHaveTextContent(STORY_LIMIT_MESSAGE);
  });

  it("dictation makes NO call to /api/voice/extract (cost + privacy invariant)", () => {
    story.supported = true;
    const item = { ...baseItem(), story: "" } as Item;
    const makeForm = () => <ItemEditForm item={item} collectionId="coll_01ULID" />;
    const { rerender } = render(makeForm());

    drive(story, rerender, makeForm, "Off to my niece, who always borrowed it.");

    expect(storyValue()).toBe("Off to my niece, who always borrowed it.");
    // Story dictation is purely local — nothing is sent anywhere.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a failing PATCH surfaces the error message and does NOT navigate", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500 });

    render(<ItemEditForm item={baseItem()} collectionId="coll_01ULID" />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((field("name") as HTMLInputElement).validity.valueMissing).toBe(true);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ItemEditForm — voice capture", () => {
  it("applies on-by-default suggestions into empty fields, marks them, and announces the change", async () => {
    enableCapture();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ color: "black", category: "shoulder bag" }),
    });
    const makeForm = () => (
      <ItemEditForm item={baseItem()} collectionId="coll_01ULID" />
    );
    const { container, rerender } = render(makeForm());

    drive(capture, rerender, makeForm, "This is a black shoulder bag");

    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    expect((field("color") as HTMLInputElement).value).toBe("black");
    expect((field("category") as HTMLInputElement).value).toBe("shoulder bag");
    expect(screen.getAllByText("from what you said")).toHaveLength(2);
    // The capture mic's live region (the only one here) announces what changed.
    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toMatch(/color/);
    expect(region?.textContent).toMatch(/category/);
  });

  it("never offers name as a suggestion when the item is already named", async () => {
    enableCapture();
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: "Black Prada Bag", brand: "Prada" }),
    });
    // baseItem() is named "Old Name"; brand "Coach".
    const makeForm = () => (
      <ItemEditForm item={baseItem()} collectionId="coll_01ULID" />
    );
    const { rerender } = render(makeForm());

    drive(capture, rerender, makeForm, "It's a black Prada bag");

    await waitFor(() =>
      expect(screen.getByRole("group", { name: REVIEW_HEADING })).toBeInTheDocument(),
    );
    // No name row (name is only offered when empty); brand is a replace row.
    expect(screen.queryByRole("checkbox", { name: /Name —/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Brand — Prada/ })).toBeInTheDocument();
  });

  it("a failed extraction keeps the transcript and can add it to notes", async () => {
    enableCapture();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "leaky server detail" }),
    });
    const makeForm = () => (
      <ItemEditForm item={baseItem()} collectionId="coll_01ULID" />
    );
    const { rerender } = render(makeForm());

    drive(capture, rerender, makeForm, "a black prada bag");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add what you said to notes" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("group", { name: REVIEW_HEADING })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add what you said to notes" }));
    expect((field("notes") as HTMLTextAreaElement).value).toBe("a black prada bag");
  });

  it("a 429 shows the gentle rest-for-today copy", async () => {
    enableCapture();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "capped" }),
    });
    const makeForm = () => (
      <ItemEditForm item={baseItem()} collectionId="coll_01ULID" />
    );
    const { container, rerender } = render(makeForm());

    drive(capture, rerender, makeForm, "a black prada bag");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add what you said to notes" }),
      ).toBeInTheDocument(),
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toBe(VOICE_CAP_MESSAGE);
  });

  it("driving the story mic never triggers the capture POST (independent mics)", () => {
    // Both mics available; drive only the story mic.
    enableCapture();
    story.supported = true;
    const item = { ...baseItem(), story: "" } as Item;
    const makeForm = () => <ItemEditForm item={item} collectionId="coll_01ULID" />;
    const { rerender } = render(makeForm());

    drive(story, rerender, makeForm, "Off to my niece.");

    expect(storyValue()).toBe("Off to my niece.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
