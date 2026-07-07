"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { VoiceCapture } from "@/features/items/VoiceCapture";

// Dev-only spike harness (plan Task 1): drives VoiceCapture on a real iPad — Safari
// tab and installed PWA — and dumps the transcripts it emits so the owner can record
// how Web Speech actually behaves on the target. Never a shipped route: it 404s in
// production (the guard below is the real boundary), not linked from any nav.
export default function DevVoicePage() {
  const [captures, setCaptures] = useState<string[]>([]);

  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-ink">Voice capture — device spike</h1>
        <p className="text-sm text-ink-soft">
          Tap the mic and talk. Watch the live region for interim words, then let the
          pause land — each finished session appends below.
        </p>
      </header>

      <VoiceCapture
        label="Add details by speaking"
        onFinalTranscript={(t) => setCaptures((prev) => [...prev, t])}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink">Captured transcripts</h2>
        {captures.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing captured yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {captures.map((t, i) => (
              <li
                key={i}
                className="rounded-control bg-surface p-3 text-sm text-ink shadow-lift ring-1 ring-hairline"
              >
                <pre className="whitespace-pre-wrap break-words font-sans">{t}</pre>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
