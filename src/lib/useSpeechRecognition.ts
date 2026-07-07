"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The named error union — one entry per failure the UI writes specific copy for.
export type SpeechRecognitionError =
  | "not-allowed"
  | "no-speech"
  | "network"
  | "aborted"
  | "unavailable";

export interface UseSpeechRecognition {
  /** Whether the browser exposes a SpeechRecognition constructor at all. */
  supported: boolean;
  /** The user's session is active — stays true across platform auto-restarts. */
  listening: boolean;
  /** Best-effort live words; may never fire on iOS Safari. Never depend on it. */
  interimTranscript: string;
  /** Final text, accumulated across auto-restarts until the user stops. */
  finalTranscript: string;
  start: () => void;
  stop: () => void;
  error: SpeechRecognitionError | null;
}

// Minimal shape of the Web Speech API — the DOM lib doesn't ship these types, and
// we only touch the members below. Kept local so the file has no ambient dependency.
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// Read the constructor live off `window` on every call — never captured at module
// load. The E2E stub (page.addInitScript) sets it before hydration, so a live lookup
// (mount effect + start()) picks it up; a module-scope capture never would.
function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function mapError(code: string): SpeechRecognitionError {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      // audio-capture, language-not-supported, bad-grammar, or anything unknown.
      return "unavailable";
  }
}

// After this many consecutive empty auto-restarts we stop, rather than loop forever
// against a persistent no-speech/error condition.
const MAX_EMPTY_RESTARTS = 2;

export function useSpeechRecognition(): UseSpeechRecognition {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<SpeechRecognitionError | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listeningRef = useRef(false);
  const userStoppedRef = useRef(false);
  const hardErrorRef = useRef(false);
  const committedFinalRef = useRef("");
  const segmentFinalRef = useRef("");
  const segmentHadSpeechRef = useRef(false);
  const emptyRestartsRef = useRef(0);

  // Feature-detect after mount (SSR-safe, and not at module scope) so the value
  // reflects the live `window` the E2E stub installs.
  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  const settle = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (listeningRef.current) return; // re-entrant-safe: ignore while already listening

    committedFinalRef.current = "";
    segmentFinalRef.current = "";
    segmentHadSpeechRef.current = false;
    emptyRestartsRef.current = 0;
    userStoppedRef.current = false;
    hardErrorRef.current = false;
    setFinalTranscript("");
    setInterimTranscript("");
    setError(null);

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    if (typeof navigator !== "undefined" && navigator.language) {
      recognition.lang = navigator.language;
    }

    recognition.onresult = (event) => {
      let segmentFinal = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) segmentFinal += text;
        else interim += text;
      }
      segmentFinalRef.current = segmentFinal;
      if (segmentFinal.length > 0 || interim.length > 0) {
        segmentHadSpeechRef.current = true;
        setError(null); // fresh speech clears a prior recoverable (no-speech) error
      }
      setInterimTranscript(interim);
      setFinalTranscript(committedFinalRef.current + segmentFinal);
    };

    recognition.onerror = (event) => {
      const mapped = mapError(event.error);
      setError(mapped);
      // no-speech is a recoverable pause; every other error is terminal for this session.
      if (mapped !== "no-speech") hardErrorRef.current = true;
    };

    recognition.onend = () => {
      // Commit this segment; interim text is best-effort and dropped at the boundary.
      committedFinalRef.current += segmentFinalRef.current;
      const hadSpeech = segmentHadSpeechRef.current;
      segmentFinalRef.current = "";
      segmentHadSpeechRef.current = false;
      setInterimTranscript("");
      setFinalTranscript(committedFinalRef.current);

      if (userStoppedRef.current || hardErrorRef.current) {
        settle();
        return;
      }

      // iOS Safari ends recognition at each sustained pause even with continuous=true.
      // Treat platform onend as normal: auto-restart and keep accumulating, until two
      // consecutive empty segments settle it (guards against an error/silence loop).
      if (hadSpeech) {
        emptyRestartsRef.current = 0;
      } else {
        emptyRestartsRef.current += 1;
        if (emptyRestartsRef.current >= MAX_EMPTY_RESTARTS) {
          settle();
          return;
        }
      }

      try {
        recognition.start();
      } catch {
        settle();
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      settle();
    }
  }, [settle]);

  const stop = useCallback(() => {
    if (!listeningRef.current) return;
    userStoppedRef.current = true;
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // stop() throws if recognition already ended — the pending onend still settles.
      }
    }
  }, []);

  // Abort any in-flight recognition on unmount so no orphaned session keeps the mic.
  useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    supported,
    listening,
    interimTranscript,
    finalTranscript,
    start,
    stop,
    error,
  };
}
