"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui";
import { DRAFT_SHAPE_FRAMING, dragHandleLabel, moveDownLabel, moveUpLabel } from "@/features/results/rerank-copy";
import { TRIAGE_ITEMS, type SampleItem } from "./sampleData";

interface WelcomeRefineProps {
  onNext: () => void;
}

function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Beat 6 — teach that the standing is living, not a verdict. It keeps updating
// as they sort, and "Adjust results" lets them hand-shape a draft before it
// becomes a shareable artifact.
export function WelcomeRefine({ onNext }: WelcomeRefineProps) {
  const [items, setItems] = useState<SampleItem[]>([
    TRIAGE_ITEMS[2],
    TRIAGE_ITEMS[0],
    TRIAGE_ITEMS[1],
  ]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    setItems((current) => reorder(current, from, to));
  }

  function handleDrop(to: number) {
    const from = draggingIndex;
    setDraggingIndex(null);
    if (from === null || from === to) return;
    setItems((current) => reorder(current, from, to));
  }

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-3xl sm:text-4xl text-ink">Refine it any time</h1>
      <div className="flex flex-col gap-3 max-w-md">
        <p className="text-lg text-ink-soft">
          The standing keeps updating as you sort. &ldquo;Adjust results&rdquo; lets you
          drag the list until it feels right.
        </p>
        <p className="text-lg text-ink-soft">
          When it feels complete, you can finalize it and share it.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3 text-left">
        <p className="text-sm text-ink-soft">{DRAFT_SHAPE_FRAMING}</p>
        <ol className="space-y-2" aria-label="Sample hand-order list">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDraggingIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => setDraggingIndex(null)}
              className={`flex items-center gap-3 rounded-card border border-hairline bg-surface p-2 transition-transform duration-200 ease-gentle motion-reduce:transition-none ${
                draggingIndex === index ? "opacity-60" : ""
              }`}
            >
              <span
                aria-hidden
                title={dragHandleLabel(item.name)}
                className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center text-lg text-ink-soft"
              >
                ⠿
              </span>
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-control bg-content-soft">
                <Image src={item.imageSrc} alt="" fill className="object-cover" unoptimized />
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
              <button
                type="button"
                aria-label={moveUpLabel(item.name)}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden>↑</span>
              </button>
              <button
                type="button"
                aria-label={moveDownLabel(item.name)}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden>↓</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <Button size="lg" onClick={onNext}>
        Continue
      </Button>
    </section>
  );
}
