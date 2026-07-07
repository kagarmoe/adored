// The client-side merge layer for voice capture: it turns a server extraction into
// reviewable suggestion rows and applies the ones the person accepts. Pure and
// framework-free (aside from the ApiError type guard) so the merge rules are easy to
// pin with fixtures — nothing here writes to the DOM or the form; the forms do that.

import { ApiError } from "./api-error";
// Type-only import — erased at build time, so the `server-only` extractor module is
// never pulled into a client bundle. It is the single source of truth for the shape
// the /api/voice/extract route returns.
import type { ExtractedItemDetails } from "@/server/services/voice-extract";

// The slice of form state the merge reads and can write. Both item forms hold these
// as strings (inputs are text; the API/DB want strings).
export interface VoiceMergeFormValues {
  name: string;
  brand: string;
  style: string;
  color: string;
  material: string;
  category: string;
  notes: string;
  height: string;
  width: string;
  depth: string;
  weight: string;
  unit: string;
}

// Fields a single suggestion row can fill directly, in the order they surface in the
// review panel. `notes` is filled only by note rows; `story` is out of extraction scope.
const FIELD_ORDER = [
  "name",
  "brand",
  "style",
  "color",
  "material",
  "category",
  "height",
  "width",
  "depth",
  "weight",
  "unit",
] as const;
type FieldRowKey = (typeof FIELD_ORDER)[number];

export type VoiceMergeField = FieldRowKey | "notes";

export type VoiceDimensionField = "height" | "width" | "depth" | "weight";

// The size fields, derived from FIELD_ORDER (single source of truth) rather than
// restated. Both forms use this for the size-disclosure derivation and the
// handleApply dimension check — no more inline ["height","width","depth","weight"].
const DIMENSION_FIELD_SET = new Set<string>([
  "height",
  "width",
  "depth",
  "weight",
]);
export const DIMENSION_FIELDS = FIELD_ORDER.filter(
  (f): f is VoiceDimensionField => DIMENSION_FIELD_SET.has(f),
);

// The unit <Select> options, shared by both forms so the copy stays in one place.
export const UNIT_OPTIONS = [
  { value: "imperial", label: "Inches / pounds" },
  { value: "metric", label: "Centimeters / kilograms" },
];

const FIELD_LABELS: Record<FieldRowKey, string> = {
  name: "Name",
  brand: "Brand",
  style: "Style",
  color: "Color",
  material: "Material",
  category: "Category",
  height: "Height",
  width: "Width",
  depth: "Depth",
  weight: "Weight",
  unit: "Units",
};

export interface VoiceFieldRow {
  kind: "field";
  id: string;
  field: FieldRowKey;
  label: string;
  /** The proposed value, stringified for form state. */
  value: string;
  /** The present value this would replace; null when the field is empty. */
  current: string | null;
  defaultOn: boolean;
}

export interface VoiceNoteRow {
  kind: "note";
  id: string;
  /** The detail text (also exactly what gets appended to notes). */
  label: string;
  value: string;
  defaultOn: boolean;
}

export type VoiceSuggestionRow = VoiceFieldRow | VoiceNoteRow;

export interface AppliedVoiceSuggestions {
  /** Field updates to merge into form state. */
  values: Partial<VoiceMergeFormValues>;
  /** Fields that changed (incl. "notes") — drives the applied-field highlight. */
  appliedFields: VoiceMergeField[];
  /** Human labels of what changed, for the live-region announcement. */
  changedLabels: string[];
}

function stringifyValue(v: string | number): string {
  return typeof v === "number" ? String(v) : v;
}

/**
 * Turn a sanitized extraction into reviewable rows against the current form state:
 * - a value into an EMPTY field is a row that is on by default (empty → value);
 * - a value into a NON-EMPTY field is a replace row, off by default, carrying the
 *   current value for a "replaces '<current>'" display;
 * - a value equal to what is already there produces no row (nothing changes);
 * - `name` is offered only when empty — a generated attribute string must never
 *   displace a name the person typed, so it is never a replace row;
 * - each `otherDetails` entry becomes an on-by-default "add to notes" row.
 */
export function buildVoiceSuggestions(
  extraction: ExtractedItemDetails,
  current: VoiceMergeFormValues,
): VoiceSuggestionRow[] {
  const rows: VoiceSuggestionRow[] = [];

  for (const fieldKey of FIELD_ORDER) {
    const raw: string | number | undefined = extraction[fieldKey];
    if (raw === undefined) continue;
    const value = stringifyValue(raw).trim();
    if (value === "") continue;

    const currentValue = current[fieldKey] ?? "";
    const isEmpty = currentValue.trim() === "";

    // name never displaces a typed name.
    if (fieldKey === "name" && !isEmpty) continue;

    if (isEmpty) {
      rows.push({
        kind: "field",
        id: fieldKey,
        field: fieldKey,
        label: FIELD_LABELS[fieldKey],
        value,
        current: null,
        defaultOn: true,
      });
    } else {
      if (currentValue.trim() === value) continue; // no change → no row
      rows.push({
        kind: "field",
        id: fieldKey,
        field: fieldKey,
        label: FIELD_LABELS[fieldKey],
        value,
        current: currentValue,
        defaultOn: false,
      });
    }
  }

  (extraction.otherDetails ?? []).forEach((detail, i) => {
    const text = detail.trim();
    if (text === "") return;
    rows.push({
      kind: "note",
      id: `note:${i}`,
      label: text,
      value: text,
      defaultOn: true,
    });
  });

  return rows;
}

/** Append detail lines below existing notes (one per line); additions alone if empty. */
export function appendNotes(existing: string, additions: string[]): string {
  const joined = additions.join("\n");
  if (existing.trim() === "") return joined;
  return `${existing}\n${joined}`;
}

/**
 * Fold the accepted rows into a set of form-state changes. Field rows overwrite their
 * field; note rows append to notes. Returns the values to merge, the changed fields
 * (for the highlight), and their labels (for the announcement).
 */
export function applyVoiceSuggestions(
  current: VoiceMergeFormValues,
  selected: VoiceSuggestionRow[],
): AppliedVoiceSuggestions {
  const values: Partial<VoiceMergeFormValues> = {};
  const appliedFields: VoiceMergeField[] = [];
  const changedLabels: string[] = [];
  const noteAdditions: string[] = [];

  for (const row of selected) {
    if (row.kind === "field") {
      values[row.field] = row.value;
      appliedFields.push(row.field);
      changedLabels.push(row.label);
    } else {
      noteAdditions.push(row.value);
    }
  }

  if (noteAdditions.length > 0) {
    values.notes = appendNotes(current.notes, noteAdditions);
    appliedFields.push("notes");
    changedLabels.push("Notes");
  }

  return { values, appliedFields, changedLabels };
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** A gentle, person's-side announcement of what applying just changed. */
export function describeApplied(labels: string[]): string {
  if (labels.length === 0) return "";
  return `Added ${joinWithAnd(labels.map((l) => l.toLowerCase()))} from what you said.`;
}

/** A concise summary of the pending rows, announced when the review panel opens. */
export function summarizeSuggestions(rows: VoiceSuggestionRow[]): string {
  if (rows.length === 0) return "";
  const parts = rows
    .filter((r): r is VoiceFieldRow => r.kind === "field")
    .map((r) => `${r.label.toLowerCase()} ${r.value}`);
  const noteCount = rows.length - parts.length;
  if (noteCount > 0) parts.push(noteCount === 1 ? "a note" : `${noteCount} notes`);
  return `Noted ${joinWithAnd(parts)}. Review before adding.`;
}

// Copy — capture-flow strings shared by both forms (litmus: the person's side).
export const VOICE_CAPTURE_INVITE =
  "Tell me about this piece — I'll note what you mention.";
export const VOICE_CAPTURE_WORKING = "Noting the details…";
export const VOICE_CAPTURE_LABEL = "Add details by speaking";
export const VOICE_ADD_TO_NOTES = "Add what you said to notes";
export const VOICE_NOTES_ADDED = "Added what you said to your notes.";
export const VOICE_CAP_MESSAGE =
  "Voice needs a rest today — everything still works by typing.";
export const VOICE_FAILED_MESSAGE =
  "I couldn't quite catch that. You can add what you said to your notes.";

/**
 * The gentle failure line for a capture attempt. A 429 gets the rest-for-today copy;
 * everything else (500/503/422, or a network error surfaced as ApiError/Error) gets
 * the generic line — a raw SDK/transport message is never shown.
 */
export function voiceFailureMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return VOICE_CAP_MESSAGE;
  return VOICE_FAILED_MESSAGE;
}

/** Feature-detect Web Speech live off `window`, mirroring the hook's own check. */
export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (window.SpeechRecognition ?? window.webkitSpeechRecognition) != null;
}
