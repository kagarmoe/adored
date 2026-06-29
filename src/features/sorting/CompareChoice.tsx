"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Button, CardImage } from "@/components/ui";

interface CompareChoiceProps {
  sessionId: string;
  itemA: Item;
  itemB: Item;
  heroA?: string;
  heroB?: string;
  /** Gentle, non-pressuring progress: how many comparisons made so far. */
  comparisonsMade: number;
}

type Result = "item_a" | "item_b" | "tie" | "skip";

export function CompareChoice({ sessionId, itemA, itemB, heroA, heroB, comparisonsMade }: CompareChoiceProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(result: Result, key: string) {
    setPending(key);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pairwise_compare",
          decision: { itemAId: itemA.id, itemBId: itemB.id, result },
        }),
      });
      if (!res.ok) throw new Error("That didn't save. Try again.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      setPending(null);
    }
  }

  const busy = pending !== null;
  const choices = [
    { item: itemA, hero: heroA, result: "item_a" as const, key: "a" },
    { item: itemB, hero: heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      {/* Tapping a card IS the choice (tap-first). Always two-up: a comparison. */}
      <div className="grid grid-cols-2 gap-4">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            onClick={() => choose(result, key)}
            className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-surface text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-content-soft">
              <CardImage
                src={hero}
                alt={itemDisplayName(item)}
                fallback={
                  <span className="font-display text-6xl text-ink-soft" aria-hidden>
                    {itemInitial(item)}
                  </span>
                }
              />
            </div>
            <div className="p-4">
              <h3 className="text-ink">{pending === key ? "Saving…" : itemDisplayName(item)}</h3>
              {item.brand && <p className="mt-1 text-sm text-ink-soft">{item.brand}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Escape hatches, deliberately quiet. */}
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => choose("tie", "tie")}>
          {pending === "tie" ? "Saving…" : "Tie"}
        </Button>
        <span className="text-hairline" aria-hidden>
          &middot;
        </span>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => choose("skip", "skip")}>
          {pending === "skip" ? "Saving…" : "Skip"}
        </Button>
      </div>

      {comparisonsMade > 0 && (
        <p className="text-center text-sm text-ink-soft">
          {comparisonsMade} {comparisonsMade === 1 ? "comparison" : "comparisons"} made so far
        </p>
      )}
      {error && <p className="text-center text-sm text-error">{error}</p>}
    </div>
  );
}
