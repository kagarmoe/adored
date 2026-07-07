// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "./useSpeechRecognition";

type FakeResult = { transcript: string; isFinal: boolean };
// Matches the browser shape the hook reads: results[i][0].transcript + results[i].isFinal.
type FakeResultList = Array<{ 0: { transcript: string }; isFinal: boolean; length: number }>;

// A fake standing in for the browser's SpeechRecognition. The hook constructs it via
// `new window.SpeechRecognition()`; tests grab the instance it created and drive the
// event callbacks the hook attached (onresult/onerror/onend).
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  startCount = 0;
  stopCount = 0;
  abortCount = 0;
  onresult:
    | ((event: { resultIndex: number; results: FakeResultList }) => void)
    | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {
    this.startCount++;
  }
  stop(): void {
    this.stopCount++;
  }
  abort(): void {
    this.abortCount++;
  }

  emitResult(results: FakeResult[]): void {
    const list: FakeResultList = results.map((r) => ({
      0: { transcript: r.transcript },
      isFinal: r.isFinal,
      length: 1,
    }));
    act(() => this.onresult?.({ resultIndex: 0, results: list }));
  }
  emitError(error: string): void {
    act(() => this.onerror?.({ error }));
  }
  emitEnd(): void {
    act(() => this.onend?.());
  }
}

function latest(): FakeSpeechRecognition {
  const list = FakeSpeechRecognition.instances;
  return list[list.length - 1];
}

function installFake(): void {
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
    FakeSpeechRecognition;
}
function uninstall(): void {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
}

beforeEach(() => {
  FakeSpeechRecognition.instances = [];
  installFake();
});
afterEach(() => {
  uninstall();
});

describe("useSpeechRecognition", () => {
  it("feature-detects support from the live window (not module scope)", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
  });

  it("reports unsupported and stays inert when no SpeechRecognition exists", () => {
    uninstall();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
  });

  it("picks up the webkit-prefixed constructor", () => {
    uninstall();
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeSpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
  });

  it("start() is re-entrant-safe — a second start while listening is ignored", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => result.current.start());
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    expect(latest().startCount).toBe(1);
    expect(result.current.listening).toBe(true);
  });

  it("exposes interim results, then commits final text", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    latest().emitResult([{ transcript: "black pra", isFinal: false }]);
    expect(result.current.interimTranscript).toBe("black pra");
    expect(result.current.finalTranscript).toBe("");
    latest().emitResult([{ transcript: "black prada bag", isFinal: true }]);
    expect(result.current.interimTranscript).toBe("");
    expect(result.current.finalTranscript).toBe("black prada bag");
  });

  it("auto-restarts on platform onend and accumulates final text across segments", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitResult([{ transcript: "black prada bag. ", isFinal: true }]);
    expect(result.current.finalTranscript).toBe("black prada bag. ");

    instance.emitEnd(); // a pause, not a user stop
    expect(result.current.listening).toBe(true);
    expect(instance.startCount).toBe(2); // same instance restarted
    expect(FakeSpeechRecognition.instances).toHaveLength(1);

    instance.emitResult([{ transcript: "it is 11 inches wide", isFinal: true }]);
    expect(result.current.finalTranscript).toBe("black prada bag. it is 11 inches wide");
  });

  it("settles to idle after two consecutive empty onends", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();

    instance.emitEnd(); // empty #1 -> restart
    expect(result.current.listening).toBe(true);
    expect(instance.startCount).toBe(2);

    instance.emitEnd(); // empty #2 -> settle
    expect(result.current.listening).toBe(false);
    expect(instance.startCount).toBe(2); // no further restart
  });

  it("a segment with speech resets the empty-restart counter", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();

    instance.emitEnd(); // empty #1 -> restart
    instance.emitResult([{ transcript: "hello ", isFinal: true }]);
    instance.emitEnd(); // had speech -> counter resets, restart
    expect(result.current.listening).toBe(true);

    instance.emitEnd(); // empty #1 again -> restart
    expect(result.current.listening).toBe(true);
    instance.emitEnd(); // empty #2 -> settle
    expect(result.current.listening).toBe(false);
  });

  it("tap-stop ends the session without restarting and preserves the transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitResult([{ transcript: "hello", isFinal: true }]);

    act(() => result.current.stop());
    expect(instance.stopCount).toBe(1);

    instance.emitEnd(); // browser fires onend after stop()
    expect(result.current.listening).toBe(false);
    expect(instance.startCount).toBe(1); // did not auto-restart
    expect(result.current.finalTranscript).toBe("hello");
  });

  it("surfaces a not-allowed permission error and does not restart", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("not-allowed");
    expect(result.current.error).toBe("not-allowed");
    instance.emitEnd();
    expect(result.current.listening).toBe(false);
    expect(instance.startCount).toBe(1);
  });

  it("maps service-not-allowed to not-allowed", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    latest().emitError("service-not-allowed");
    expect(result.current.error).toBe("not-allowed");
  });

  it("surfaces a network error and does not restart", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("network");
    expect(result.current.error).toBe("network");
    instance.emitEnd();
    expect(result.current.listening).toBe(false);
    expect(instance.startCount).toBe(1);
  });

  it("surfaces an aborted error and does not restart", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("aborted");
    expect(result.current.error).toBe("aborted");
    instance.emitEnd();
    expect(result.current.listening).toBe(false);
    expect(instance.startCount).toBe(1);
  });

  it("maps audio-capture (and other unknowns) to unavailable", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    latest().emitError("audio-capture");
    expect(result.current.error).toBe("unavailable");
  });

  it("treats no-speech as recoverable — names it but keeps listening one more segment", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("no-speech");
    expect(result.current.error).toBe("no-speech");
    instance.emitEnd(); // soft error, empty #1 -> restart
    expect(result.current.listening).toBe(true);
    expect(instance.startCount).toBe(2);
  });

  it("settles after two silent segments even when no-speech keeps firing", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("no-speech");
    instance.emitEnd(); // empty #1 -> restart
    expect(result.current.listening).toBe(true);
    instance.emitError("no-speech");
    instance.emitEnd(); // empty #2 -> settle
    expect(result.current.listening).toBe(false);
  });

  it("clears the error once speech is recognized again", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    instance.emitError("no-speech");
    expect(result.current.error).toBe("no-speech");
    instance.emitResult([{ transcript: "hello", isFinal: true }]);
    expect(result.current.error).toBeNull();
  });

  it("resets accumulated transcript on a fresh start()", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    latest().emitResult([{ transcript: "first", isFinal: true }]);
    act(() => result.current.stop());
    latest().emitEnd();
    expect(result.current.finalTranscript).toBe("first");

    act(() => result.current.start());
    expect(result.current.finalTranscript).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("aborts recognition on unmount", () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const instance = latest();
    unmount();
    expect(instance.abortCount).toBe(1);
  });
});
