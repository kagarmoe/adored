// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { VoiceReviewPanel } from "./VoiceReviewPanel";
import { buildVoiceSuggestions, type VoiceMergeFormValues } from "@/lib/voice-extract-merge";

function emptyForm(over: Partial<VoiceMergeFormValues> = {}): VoiceMergeFormValues {
  return {
    name: "",
    brand: "",
    style: "",
    color: "",
    material: "",
    category: "",
    notes: "",
    height: "",
    width: "",
    depth: "",
    weight: "",
    unit: "imperial",
    ...over,
  };
}

const HEADING = "Here's what I noted";

describe("VoiceReviewPanel", () => {
  it("shows the transcript and moves focus to the panel on open", () => {
    const rows = buildVoiceSuggestions({ brand: "Prada" }, emptyForm());
    render(
      <VoiceReviewPanel
        transcript="This is a black Prada shoulder bag"
        rows={rows}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/This is a black Prada shoulder bag/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: HEADING })).toHaveFocus();
  });

  it("defaults empty-target rows on and replace rows off, showing the replaced value", () => {
    const rows = buildVoiceSuggestions(
      { color: "black", brand: "Gucci" },
      emptyForm({ brand: "Coach" }),
    );
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={vi.fn()} onDismiss={vi.fn()} />,
    );

    // color targets an empty field → checked; brand replaces "Coach" → unchecked.
    const color = screen.getByRole("checkbox", { name: /Color — black/ });
    const brand = screen.getByRole("checkbox", { name: /Brand — Gucci/ });
    expect(color).toBeChecked();
    expect(brand).not.toBeChecked();
    expect(screen.getByText(/replaces “Coach”/)).toBeInTheDocument();
  });

  it("'Add these' applies exactly the on rows", () => {
    const onApply = vi.fn();
    const rows = buildVoiceSuggestions(
      { color: "black", brand: "Gucci" },
      emptyForm({ brand: "Coach" }),
    );
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={onApply} onDismiss={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    // Only the default-on color row; the off-by-default brand replace stays out.
    expect(applied).toHaveLength(1);
    expect(applied[0].field).toBe("color");
  });

  it("toggling a replace row on includes it in the applied set", () => {
    const onApply = vi.fn();
    const rows = buildVoiceSuggestions({ brand: "Gucci" }, emptyForm({ brand: "Coach" }));
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={onApply} onDismiss={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Brand — Gucci/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add these" }));

    expect(onApply.mock.calls[0][0]).toHaveLength(1);
    expect(onApply.mock.calls[0][0][0].field).toBe("brand");
  });

  it("each toggle row is a checkbox with a ≥44px tap target", () => {
    const rows = buildVoiceSuggestions({ brand: "Prada" }, emptyForm());
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={vi.fn()} onDismiss={vi.fn()} />,
    );
    const label = screen.getByText(/Brand — Prada/).closest("label")!;
    expect(label.className).toMatch(/\bmin-h-11\b/);
  });

  it("renders otherDetails as 'add to notes' rows, on by default", () => {
    const rows = buildVoiceSuggestions({ otherDetails: ["Strap: 24 in"] }, emptyForm());
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox", { name: /Strap: 24 in/ })).toBeChecked();
  });

  it("'Not now' dismisses without applying", () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    const rows = buildVoiceSuggestions({ brand: "Prada" }, emptyForm());
    render(
      <VoiceReviewPanel transcript="t" rows={rows} onApply={onApply} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
