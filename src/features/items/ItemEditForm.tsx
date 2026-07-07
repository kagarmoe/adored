"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { apiPost } from "@/lib/api-client";
import { VoiceCapture } from "./VoiceCapture";
import { VoiceReviewPanel, VoiceApplied } from "./VoiceReviewPanel";
import {
  appendStoryDictation,
  STORY_LIMIT_MESSAGE,
  STORY_MAX_LENGTH,
} from "@/lib/voice-dictation";
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
import type { Item } from "@/types";

const UNIT_OPTIONS = [
  { value: "imperial", label: "Inches / pounds" },
  { value: "metric", label: "Centimeters / kilograms" },
];

interface ItemEditFormProps {
  item: Item;
  collectionId: string;
}

export function ItemEditForm({ item, collectionId }: ItemEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: item.name ?? "",
    brand: item.brand || "",
    style: item.style || "",
    color: item.color || "",
    material: item.material || "",
    category: item.category || "",
    notes: item.notes || "",
    story: item.story ?? "",
    height: item.height || "",
    width: item.width || "",
    depth: item.depth || "",
    weight: item.weight || "",
    unit: item.unit || "imperial",
  });

  // True once dictation has filled the story to its cap, so the mic's live region
  // surfaces the limit copy. Recomputed on every dictation session.
  const [storyLimitReached, setStoryLimitReached] = useState(false);

  // Story dictation appends verbatim and clamps in code — the textarea's maxLength
  // only guards typing, not programmatic sets. Story only; notes uses the OS mic.
  const handleStoryDictation = (transcript: string) => {
    const { text, clamped } = appendStoryDictation(formData.story, transcript);
    setFormData((prev) => ({ ...prev, story: text }));
    setStoryLimitReached(clamped);
  };

  // Size stays tucked away by default; any dimension value (loaded, typed, or
  // later voice-applied) forces the disclosure open so nothing is hidden.
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeExpanded =
    sizeOpen ||
    Boolean(
      formData.height || formData.width || formData.depth || formData.weight,
    );

  // ── Structured voice capture ────────────────────────────────────────────────
  // The invite shows only where speech is available; the mic self-hides otherwise.
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
    // Single-flight: one extraction at a time.
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

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // PATCH targets the stable ULID; the page URL uses the human-readable catalog number.
      const response = await fetch(
        `/api/collections/${collectionId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update item");
      }

      router.push(`/collections/${collectionId}/items/${item.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <Card padding="lg" className="bg-error-soft border border-error-soft">
          <p className="text-error-deep">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card padding="lg" className="space-y-4">
          {/* Capture affordance stays mounted (the mic self-hides where speech is
              unavailable); the invite line appears only when speech is available. */}
          <div className="space-y-2">
            {voiceSupported && (
              <p className="text-sm text-ink-soft">{VOICE_CAPTURE_INVITE}</p>
            )}
            <VoiceCapture
              label={VOICE_CAPTURE_LABEL}
              message={captureMessage}
              onFinalTranscript={handleCapture}
            />
          </div>

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
              name="name"
              label="Item name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("brand")}>
            <Input
              name="brand"
              label="Brand"
              value={formData.brand}
              onChange={handleChange}
              placeholder="Optional"
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("style")}>
            <Input
              name="style"
              label="Style"
              value={formData.style}
              onChange={handleChange}
              placeholder="Optional"
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("color")}>
            <Input
              name="color"
              label="Color"
              value={formData.color}
              onChange={handleChange}
              placeholder="Optional"
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("material")}>
            <Input
              name="material"
              label="Material"
              value={formData.material}
              onChange={handleChange}
              placeholder="Optional"
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("category")}>
            <Input
              name="category"
              label="Category"
              value={formData.category}
              onChange={handleChange}
              placeholder="Optional"
            />
          </VoiceApplied>

          <VoiceApplied applied={isApplied("notes")}>
            <Textarea
              name="notes"
              label="Notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Add any additional notes about this item"
            />
          </VoiceApplied>

          <div className="space-y-2">
            <Textarea
              name="story"
              label="Where will it go next?"
              value={formData.story}
              onChange={handleChange}
              placeholder="To my niece, who always borrowed it…"
              maxLength={STORY_MAX_LENGTH}
            />
            <VoiceCapture
              label="Speak your story"
              message={storyLimitReached ? STORY_LIMIT_MESSAGE : undefined}
              onFinalTranscript={handleStoryDictation}
            />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSizeOpen((open) => !open)}
              aria-expanded={sizeExpanded}
              className="text-sm text-primary underline underline-offset-2"
            >
              {sizeExpanded ? "Size" : "Add size"}
            </button>

            {sizeExpanded && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <VoiceApplied applied={isApplied("height")}>
                    <Input
                      name="height"
                      label="Height"
                      inputMode="decimal"
                      value={formData.height}
                      onChange={handleChange}
                      placeholder="Optional"
                    />
                  </VoiceApplied>
                  <VoiceApplied applied={isApplied("width")}>
                    <Input
                      name="width"
                      label="Width"
                      inputMode="decimal"
                      value={formData.width}
                      onChange={handleChange}
                      placeholder="Optional"
                    />
                  </VoiceApplied>
                  <VoiceApplied applied={isApplied("depth")}>
                    <Input
                      name="depth"
                      label="Depth"
                      inputMode="decimal"
                      value={formData.depth}
                      onChange={handleChange}
                      placeholder="Optional"
                    />
                  </VoiceApplied>
                </div>
                <VoiceApplied applied={isApplied("weight")}>
                  <Input
                    name="weight"
                    label="Weight"
                    inputMode="decimal"
                    value={formData.weight}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                </VoiceApplied>
                <VoiceApplied applied={isApplied("unit")}>
                  <Select
                    name="unit"
                    label="Units"
                    options={UNIT_OPTIONS}
                    value={formData.unit}
                    onChange={handleChange}
                  />
                </VoiceApplied>
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
