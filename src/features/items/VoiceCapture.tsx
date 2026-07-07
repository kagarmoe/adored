"use client";

import { useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Exact per spec UX section (the person's side — offers the typed path, no blame).
const MIC_PERMISSION_DENIED =
  "We couldn't reach the microphone. You can type instead — or allow microphone access and try again.";
const STOPPED_LISTENING = "Stopped listening";

interface VoiceCaptureProps {
  /** Accessible name for the mic toggle (e.g. "Add details by speaking"). */
  label: string;
  /**
   * Downstream status for the one shared live region — e.g. a post-extraction
   * summary. Announced politely when present; capture state shares this region.
   */
  message?: string;
  /** Receives the accumulated transcript when a listening session ends. */
  onFinalTranscript?: (transcript: string) => void;
  /**
   * Optional ref to the mic toggle button, so a caller can return focus to it
   * (e.g. after the review panel closes). Null when the browser can't do speech.
   */
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

// The reusable voice-capture primitive: one mic toggle, one polite live region, and a
// quiet pulse while listening. Renders nothing where the browser can't do speech, so
// the typed path is simply never interrupted.
export function VoiceCapture({
  label,
  message,
  onFinalTranscript,
  buttonRef,
  className,
}: VoiceCaptureProps) {
  const { supported, listening, interimTranscript, finalTranscript, start, stop, error } =
    useSpeechRecognition();
  const reducedMotion = useReducedMotion();
  const [ended, setEnded] = useState(false);
  const wasListening = useRef(false);

  useEffect(() => {
    if (wasListening.current && !listening) {
      setEnded(true);
      if (finalTranscript) onFinalTranscript?.(finalTranscript);
    }
    if (listening) setEnded(false);
    wasListening.current = listening;
  }, [listening, finalTranscript, onFinalTranscript]);

  if (!supported) return null;

  const liveMessage =
    error === "not-allowed"
      ? MIC_PERMISSION_DENIED
      : listening
        ? interimTranscript
        : (message ?? (ended ? STOPPED_LISTENING : ""));

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-pressed={listening}
        onClick={() => (listening ? stop() : start())}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-lift transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          listening
            ? "text-primary ring-2 ring-primary"
            : "text-ink ring-1 ring-ink/10 hover:bg-surface-raised"
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 11a7 7 0 0014 0M12 18v3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {listening && (
        <span
          data-testid="voice-listening-indicator"
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full bg-primary ${
            reducedMotion ? "" : "animate-pulse"
          }`}
        />
      )}
      <p aria-live="polite" className="min-h-[1.25rem] text-sm text-ink-soft">
        {liveMessage}
      </p>
    </div>
  );
}
