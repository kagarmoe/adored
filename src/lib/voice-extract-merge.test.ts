import { describe, expect, it } from "vitest";
import { ApiError } from "./api-error";
import {
  appendNotes,
  applyVoiceSuggestions,
  buildVoiceSuggestions,
  describeApplied,
  summarizeSuggestions,
  voiceFailureMessage,
  VOICE_CAP_MESSAGE,
  VOICE_FAILED_MESSAGE,
  type VoiceFieldRow,
  type VoiceMergeFormValues,
  type VoiceNoteRow,
  type VoiceSuggestionRow,
} from "./voice-extract-merge";

// A blank form: every mergeable field empty, unit at its imperial default (the
// forms always seed unit, so it is never literally empty).
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

function field(rows: VoiceSuggestionRow[], f: string): VoiceFieldRow | undefined {
  return rows.find((r): r is VoiceFieldRow => r.kind === "field" && r.field === f);
}
function notes(rows: VoiceSuggestionRow[]): VoiceNoteRow[] {
  return rows.filter((r): r is VoiceNoteRow => r.kind === "note");
}

describe("buildVoiceSuggestions", () => {
  it("hero 1 — 'a black Prada shoulder bag' fills three empty fields, all on", () => {
    const rows = buildVoiceSuggestions(
      { brand: "Prada", color: "black", category: "shoulder bag" },
      emptyForm(),
    );

    expect(rows).toHaveLength(3);
    for (const f of ["brand", "color", "category"]) {
      const row = field(rows, f)!;
      expect(row.current).toBeNull();
      expect(row.defaultOn).toBe(true);
    }
    expect(field(rows, "brand")!.value).toBe("Prada");
    expect(field(rows, "color")!.value).toBe("black");
    expect(field(rows, "category")!.value).toBe("shoulder bag");
  });

  it("hero 2 — dimensions become on-by-default field rows; the strap is a note; numbers stringified", () => {
    const rows = buildVoiceSuggestions(
      { width: 11, height: 9, unit: "imperial", otherDetails: ["Strap: 24 in"] },
      emptyForm(),
    );

    expect(field(rows, "width")!.value).toBe("11");
    expect(field(rows, "width")!.defaultOn).toBe(true);
    expect(field(rows, "height")!.value).toBe("9");
    // unit already equals the form default → no redundant row.
    expect(field(rows, "unit")).toBeUndefined();

    const noteRows = notes(rows);
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0].label).toBe("Strap: 24 in");
    expect(noteRows[0].defaultOn).toBe(true);
  });

  it("mixed-unit — the odd-unit clause rides otherDetails; dimensions keep the resolved unit", () => {
    const rows = buildVoiceSuggestions(
      { width: 11, height: 9, unit: "imperial", otherDetails: ["Strap: 60 cm"] },
      emptyForm(),
    );

    // No metric unit row is invented from the cm strap.
    expect(field(rows, "unit")).toBeUndefined();
    expect(field(rows, "width")!.value).toBe("11");
    expect(notes(rows).map((n) => n.label)).toEqual(["Strap: 60 cm"]);
  });

  it("decimal dimensions stringify without loss", () => {
    const rows = buildVoiceSuggestions({ width: 11.5 }, emptyForm());
    expect(field(rows, "width")!.value).toBe("11.5");
  });

  it("a non-empty field yields a replace row: off by default, carrying the current value", () => {
    const rows = buildVoiceSuggestions({ brand: "Gucci" }, emptyForm({ brand: "Coach" }));
    const row = field(rows, "brand")!;
    expect(row.value).toBe("Gucci");
    expect(row.current).toBe("Coach");
    expect(row.defaultOn).toBe(false);
  });

  it("an extracted value equal to the current value produces no row", () => {
    const rows = buildVoiceSuggestions({ brand: "Coach" }, emptyForm({ brand: "Coach" }));
    expect(field(rows, "brand")).toBeUndefined();
  });

  it("name is offered only when empty — never as a replace row", () => {
    const onEmpty = buildVoiceSuggestions({ name: "Black Prada Bag" }, emptyForm());
    expect(field(onEmpty, "name")!.defaultOn).toBe(true);
    expect(field(onEmpty, "name")!.current).toBeNull();

    const onNamed = buildVoiceSuggestions(
      { name: "Black Prada Bag" },
      emptyForm({ name: "Mom's purse" }),
    );
    expect(field(onNamed, "name")).toBeUndefined();
  });

  it("a unit change against a non-default unit is a replace row, off by default", () => {
    const rows = buildVoiceSuggestions({ unit: "metric" }, emptyForm({ unit: "imperial" }));
    const row = field(rows, "unit")!;
    expect(row.value).toBe("metric");
    expect(row.current).toBe("imperial");
    expect(row.defaultOn).toBe(false);
  });

  it("empty extraction produces no rows", () => {
    expect(buildVoiceSuggestions({}, emptyForm())).toEqual([]);
  });

  it("partial extraction leaves untouched fields alone", () => {
    const rows = buildVoiceSuggestions({ color: "red" }, emptyForm({ brand: "Coach" }));
    expect(rows).toHaveLength(1);
    expect(field(rows, "color")!.value).toBe("red");
    expect(field(rows, "brand")).toBeUndefined();
  });
});

describe("applyVoiceSuggestions", () => {
  it("applies selected field rows and reports the changed labels", () => {
    const rows = buildVoiceSuggestions(
      { brand: "Prada", color: "black" },
      emptyForm(),
    );
    const applied = applyVoiceSuggestions(emptyForm(), rows);

    expect(applied.values).toEqual({ brand: "Prada", color: "black" });
    expect(applied.appliedFields).toEqual(["brand", "color"]);
    expect(applied.changedLabels).toEqual(["Brand", "Color"]);
  });

  it("joins selected note rows onto the existing notes and marks notes changed", () => {
    const rows = buildVoiceSuggestions(
      { otherDetails: ["Strap: 24 in", "Gold hardware"] },
      emptyForm({ notes: "Bought in Milan." }),
    );
    const applied = applyVoiceSuggestions(emptyForm({ notes: "Bought in Milan." }), rows);

    expect(applied.values.notes).toBe("Bought in Milan.\nStrap: 24 in\nGold hardware");
    expect(applied.appliedFields).toContain("notes");
  });

  it("ignores unselected rows", () => {
    const rows = buildVoiceSuggestions({ brand: "Prada", color: "black" }, emptyForm());
    const onlyBrand = rows.filter((r) => r.kind === "field" && r.field === "brand");
    const applied = applyVoiceSuggestions(emptyForm(), onlyBrand);
    expect(applied.values).toEqual({ brand: "Prada" });
  });
});

describe("appendNotes", () => {
  it("returns the additions alone when notes is empty", () => {
    expect(appendNotes("", ["Strap: 24 in"])).toBe("Strap: 24 in");
  });
  it("appends below existing notes, one detail per line", () => {
    expect(appendNotes("Loved it.", ["A", "B"])).toBe("Loved it.\nA\nB");
  });
});

describe("describeApplied", () => {
  it("lists the changed fields on the person's side", () => {
    expect(describeApplied(["Brand", "Color", "Category"])).toBe(
      "Added brand, color, and category from what you said.",
    );
    expect(describeApplied(["Brand"])).toBe("Added brand from what you said.");
    expect(describeApplied([])).toBe("");
  });
});

describe("summarizeSuggestions", () => {
  it("names the captured fields for the live region", () => {
    const rows = buildVoiceSuggestions(
      { brand: "Prada", color: "black", category: "shoulder bag" },
      emptyForm(),
    );
    const summary = summarizeSuggestions(rows);
    expect(summary).toContain("Prada");
    expect(summary).toContain("black");
    expect(summary).toContain("shoulder bag");
  });
});

describe("voiceFailureMessage", () => {
  it("uses the gentle cap copy for a 429", () => {
    expect(voiceFailureMessage(new ApiError(429, "capped"))).toBe(VOICE_CAP_MESSAGE);
  });
  it("uses the generic gentle copy for other failures and network errors", () => {
    expect(voiceFailureMessage(new ApiError(500, "server-detail"))).toBe(VOICE_FAILED_MESSAGE);
    expect(voiceFailureMessage(new ApiError(503, "unavailable"))).toBe(VOICE_FAILED_MESSAGE);
    expect(voiceFailureMessage(new Error("Failed to fetch"))).toBe(VOICE_FAILED_MESSAGE);
  });
  it("never leaks a raw error detail", () => {
    expect(voiceFailureMessage(new ApiError(500, "stack trace leak"))).not.toContain("leak");
  });
});
