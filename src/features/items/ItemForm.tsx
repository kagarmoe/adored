"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { Button, Input, Select, Textarea, ErrorMessage } from "@/components/ui";
import { apiPost, apiPatch } from "@/lib/api-client";
import { VoiceCapture } from "./VoiceCapture";
import { VoiceReviewPanel, VoiceApplied } from "./VoiceReviewPanel";
import {
  applyVoiceSuggestions,
  appendNotes,
  buildVoiceSuggestions,
  describeApplied,
  speechRecognitionSupported,
  summarizeSuggestions,
  voiceFailureMessage,
  VOICE_ADD_TO_NOTES,
  VOICE_CAPTURE_INVITE,
  VOICE_CAPTURE_LABEL,
  VOICE_CAPTURE_WORKING,
  VOICE_FAILED_MESSAGE,
  VOICE_NOTES_ADDED,
  type VoiceMergeField,
  type VoiceMergeFormValues,
  type VoiceSuggestionRow,
} from "@/lib/voice-extract-merge";
import type { ExtractedItemDetails } from "@/server/services/voice-extract";
import { z } from "zod";

const itemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  // Dimensions travel as text; the server (CreateItemSchema) is the boundary
  // that enforces positive-finite-decimal, so the client just carries them.
  height: z.string().optional(),
  width: z.string().optional(),
  depth: z.string().optional(),
  weight: z.string().optional(),
  unit: z.enum(["imperial", "metric"]).optional(),
});

const UNIT_OPTIONS = [
  { value: "imperial", label: "Inches / pounds" },
  { value: "metric", label: "Centimeters / kilograms" },
];

interface ItemFormProps {
  item?: Item;
  collectionId: string;
  mode: "create" | "edit";
}

export function ItemForm({ item, collectionId, mode }: ItemFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: item?.name || "",
    brand: item?.brand || "",
    style: item?.style || "",
    color: item?.color || "",
    material: item?.material || "",
    category: item?.category || "",
    notes: item?.notes || "",
    height: item?.height || "",
    width: item?.width || "",
    depth: item?.depth || "",
    weight: item?.weight || "",
    unit: item?.unit || "imperial",
  });

  // The size fields stay tucked away by default (TONE: no permanent spec-sheet
  // grid). Any dimension value — loaded, typed, or later voice-applied — forces
  // the disclosure open so nothing is hidden.
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeExpanded =
    sizeOpen ||
    Boolean(
      formData.height || formData.width || formData.depth || formData.weight,
    );

  // ── Voice capture ──────────────────────────────────────────────────────────
  // The mic renders only where the browser can do speech (mirrors the hook's own
  // detection); typing is always whole, so there is no preflight or nagging.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => setVoiceSupported(speechRecognitionSupported()), []);

  const [captureMessage, setCaptureMessage] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<{
    transcript: string;
    rows: VoiceSuggestionRow[];
  } | null>(null);
  const [retained, setRetained] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<VoiceMergeField>>(new Set());
  const inFlight = useRef(false);

  const mergeValues = (): VoiceMergeFormValues => ({
    name: formData.name,
    brand: formData.brand,
    style: formData.style,
    color: formData.color,
    material: formData.material,
    category: formData.category,
    notes: formData.notes,
    height: formData.height,
    width: formData.width,
    depth: formData.depth,
    weight: formData.weight,
    unit: formData.unit,
  });

  const isApplied = (f: VoiceMergeField) => applied.has(f);

  async function handleCapture(transcript: string) {
    // Single-flight: one extraction at a time. A second utterance mid-request is
    // dropped rather than racing a concurrent POST.
    if (inFlight.current) return;
    inFlight.current = true;
    setRetained(null);
    setPending(null);
    setCaptureMessage(VOICE_CAPTURE_WORKING);
    try {
      const details = await apiPost<ExtractedItemDetails>("/api/voice/extract", {
        transcript,
      });
      const rows = buildVoiceSuggestions(details, mergeValues());
      if (rows.length === 0) {
        setRetained(transcript);
        setCaptureMessage(VOICE_FAILED_MESSAGE);
      } else {
        // A fresh capture replaces any prior pending set — it never stacks.
        setPending({ transcript, rows });
        setCaptureMessage(summarizeSuggestions(rows));
      }
    } catch (err) {
      // Any failure keeps the words; the transcript can still go to notes.
      setRetained(transcript);
      setCaptureMessage(voiceFailureMessage(err));
    } finally {
      inFlight.current = false;
    }
  }

  function handleApply(selected: VoiceSuggestionRow[]) {
    const result = applyVoiceSuggestions(mergeValues(), selected);
    setFormData((prev) => ({ ...prev, ...result.values }));
    setApplied(new Set(result.appliedFields));
    setCaptureMessage(describeApplied(result.changedLabels));
    setPending(null);
    setRetained(null);
    // A voice-applied dimension opens the size disclosure (sizeExpanded also
    // derives it from the value, but this keeps intent explicit).
    if (result.appliedFields.some((f) => ["height", "width", "depth", "weight"].includes(f))) {
      setSizeOpen(true);
    }
  }

  function handleDismiss() {
    setRetained(pending?.transcript ?? null);
    setPending(null);
    setCaptureMessage(undefined);
  }

  function handleAddToNotes() {
    if (!retained) return;
    setFormData((prev) => ({ ...prev, notes: appendNotes(prev.notes, [retained]) }));
    setApplied(new Set<VoiceMergeField>(["notes"]));
    setCaptureMessage(VOICE_NOTES_ADDED);
    setRetained(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = itemSchema.parse(formData);

      if (mode === "create") {
        const result = await apiPost<Item>(`/api/collections/${collectionId}/items`, validated);
        // The server assigns a catalog number; the page URL uses that human-readable number.
        router.push(`/collections/${collectionId}/items/${result.number}`);
      } else if (item) {
        // PATCH targets the stable ULID; the page URL uses the human-readable catalog number.
        await apiPatch(`/api/collections/${collectionId}/items/${item.id}`, validated);
        router.push(`/collections/${collectionId}/items/${item.number}`);
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err?.message || "Failed to save item");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

      {voiceSupported && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">{VOICE_CAPTURE_INVITE}</p>
          <VoiceCapture
            label={VOICE_CAPTURE_LABEL}
            message={captureMessage}
            onFinalTranscript={handleCapture}
          />
        </div>
      )}

      {pending && (
        <VoiceReviewPanel
          transcript={pending.transcript}
          rows={pending.rows}
          onApply={handleApply}
          onDismiss={handleDismiss}
        />
      )}

      {retained && (
        <Button type="button" variant="secondary" onClick={handleAddToNotes}>
          {VOICE_ADD_TO_NOTES}
        </Button>
      )}

      <VoiceApplied applied={isApplied("name")}>
        <Input
          label="Item name"
          required
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <VoiceApplied applied={isApplied("brand")}>
        <Input
          label="Brand"
          value={formData.brand}
          onChange={(e) => setFormData((prev) => ({ ...prev, brand: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <VoiceApplied applied={isApplied("style")}>
        <Input
          label="Style"
          value={formData.style}
          onChange={(e) => setFormData((prev) => ({ ...prev, style: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <VoiceApplied applied={isApplied("color")}>
        <Input
          label="Color"
          value={formData.color}
          onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <VoiceApplied applied={isApplied("material")}>
        <Input
          label="Material"
          value={formData.material}
          onChange={(e) => setFormData((prev) => ({ ...prev, material: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <VoiceApplied applied={isApplied("category")}>
        <Input
          label="Category"
          value={formData.category}
          onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
          disabled={loading}
        />
      </VoiceApplied>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSizeOpen((open) => !open)}
          aria-expanded={sizeExpanded}
          disabled={loading}
          className="text-sm text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {sizeExpanded ? "Size" : "Add size"}
        </button>

        {sizeExpanded && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <VoiceApplied applied={isApplied("height")}>
                <Input
                  label="Height"
                  inputMode="decimal"
                  value={formData.height}
                  onChange={(e) => setFormData((prev) => ({ ...prev, height: e.target.value }))}
                  disabled={loading}
                />
              </VoiceApplied>
              <VoiceApplied applied={isApplied("width")}>
                <Input
                  label="Width"
                  inputMode="decimal"
                  value={formData.width}
                  onChange={(e) => setFormData((prev) => ({ ...prev, width: e.target.value }))}
                  disabled={loading}
                />
              </VoiceApplied>
              <VoiceApplied applied={isApplied("depth")}>
                <Input
                  label="Depth"
                  inputMode="decimal"
                  value={formData.depth}
                  onChange={(e) => setFormData((prev) => ({ ...prev, depth: e.target.value }))}
                  disabled={loading}
                />
              </VoiceApplied>
            </div>
            <VoiceApplied applied={isApplied("weight")}>
              <Input
                label="Weight"
                inputMode="decimal"
                value={formData.weight}
                onChange={(e) => setFormData((prev) => ({ ...prev, weight: e.target.value }))}
                disabled={loading}
              />
            </VoiceApplied>
            <VoiceApplied applied={isApplied("unit")}>
              <Select
                name="unit"
                label="Units"
                options={UNIT_OPTIONS}
                value={formData.unit}
                onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                disabled={loading}
              />
            </VoiceApplied>
          </div>
        )}
      </div>

      <VoiceApplied applied={isApplied("notes")}>
        <Textarea
          label="Notes"
          value={formData.notes}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          disabled={loading}
          rows={4}
        />
      </VoiceApplied>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : mode === "create" ? "Add item" : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
