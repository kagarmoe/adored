// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Control the two hooks the component depends on. The hook itself is covered by
// useSpeechRecognition.test.ts; here we assert the component's rendering + a11y.
const hoisted = vi.hoisted(() => ({
  speech: {
    supported: true,
    listening: false,
    interimTranscript: "",
    finalTranscript: "",
    error: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
  },
  reduced: { value: false },
}));

vi.mock("@/lib/useSpeechRecognition", () => ({
  useSpeechRecognition: () => hoisted.speech,
}));
vi.mock("@/lib/useReducedMotion", () => ({
  useReducedMotion: () => hoisted.reduced.value,
}));

import { VoiceCapture } from "./VoiceCapture";

const PERMISSION_COPY =
  "We couldn't reach the microphone. You can type instead — or allow microphone access and try again.";

function liveRegion(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[aria-live="polite"]');
  if (!el) throw new Error("no polite live region");
  return el as HTMLElement;
}

beforeEach(() => {
  hoisted.speech.supported = true;
  hoisted.speech.listening = false;
  hoisted.speech.interimTranscript = "";
  hoisted.speech.finalTranscript = "";
  hoisted.speech.error = null;
  hoisted.speech.start = vi.fn();
  hoisted.speech.stop = vi.fn();
  hoisted.reduced.value = false;
});

describe("VoiceCapture", () => {
  it("renders nothing when speech is unsupported", () => {
    hoisted.speech.supported = false;
    const { container } = render(<VoiceCapture label="Add details by speaking" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a labelled mic toggle, aria-pressed=false and ≥44px, that starts on tap", () => {
    render(<VoiceCapture label="Add details by speaking" />);
    const btn = screen.getByRole("button", { name: "Add details by speaking" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn.className).toMatch(/\bh-11\b/);
    expect(btn.className).toMatch(/\bw-11\b/);
    fireEvent.click(btn);
    expect(hoisted.speech.start).toHaveBeenCalledTimes(1);
    expect(hoisted.speech.stop).not.toHaveBeenCalled();
  });

  it("reflects listening state: aria-pressed=true and a tap stops", () => {
    hoisted.speech.listening = true;
    render(<VoiceCapture label="Add details by speaking" />);
    const btn = screen.getByRole("button", { name: "Add details by speaking" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(hoisted.speech.stop).toHaveBeenCalledTimes(1);
    expect(hoisted.speech.start).not.toHaveBeenCalled();
  });

  it("shows a pulsing indicator while listening", () => {
    hoisted.speech.listening = true;
    render(<VoiceCapture label="Speak your story" />);
    const dot = screen.getByTestId("voice-listening-indicator");
    expect(dot).toBeInTheDocument();
    expect(dot.className).toMatch(/\banimate-pulse\b/);
  });

  it("hides the indicator when idle", () => {
    render(<VoiceCapture label="Speak your story" />);
    expect(screen.queryByTestId("voice-listening-indicator")).not.toBeInTheDocument();
  });

  it("honors reduced motion — the indicator does not animate", () => {
    hoisted.speech.listening = true;
    hoisted.reduced.value = true;
    render(<VoiceCapture label="Speak your story" />);
    const dot = screen.getByTestId("voice-listening-indicator");
    expect(dot.className).not.toMatch(/animate-pulse/);
  });

  it("carries interim transcript in the one polite live region while listening", () => {
    hoisted.speech.listening = true;
    hoisted.speech.interimTranscript = "black prada";
    const { container } = render(<VoiceCapture label="Add details by speaking" />);
    const region = liveRegion(container);
    expect(region).toHaveTextContent("black prada");
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("announces 'Stopped listening' after a session ends", () => {
    hoisted.speech.listening = true;
    const { container, rerender } = render(<VoiceCapture label="Add details by speaking" />);
    hoisted.speech.listening = false;
    rerender(<VoiceCapture label="Add details by speaking" />);
    expect(liveRegion(container)).toHaveTextContent("Stopped listening");
  });

  it("shows the exact permission-denied copy when access is not allowed", () => {
    hoisted.speech.error = "not-allowed";
    const { container } = render(<VoiceCapture label="Add details by speaking" />);
    expect(screen.getByText(PERMISSION_COPY)).toBeInTheDocument();
    expect(liveRegion(container)).toHaveTextContent(PERMISSION_COPY);
  });

  it("announces a downstream message passed in via prop", () => {
    const { container } = render(
      <VoiceCapture label="Add details by speaking" message="Noted: brand Prada" />,
    );
    expect(liveRegion(container)).toHaveTextContent("Noted: brand Prada");
  });

  it("emits the final transcript to onFinalTranscript when a session ends", () => {
    const onFinalTranscript = vi.fn();
    hoisted.speech.listening = true;
    const { rerender } = render(
      <VoiceCapture label="Add details by speaking" onFinalTranscript={onFinalTranscript} />,
    );
    expect(onFinalTranscript).not.toHaveBeenCalled();
    hoisted.speech.listening = false;
    hoisted.speech.finalTranscript = "black prada bag";
    rerender(
      <VoiceCapture label="Add details by speaking" onFinalTranscript={onFinalTranscript} />,
    );
    expect(onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(onFinalTranscript).toHaveBeenCalledWith("black prada bag");
  });

  it("does not emit when a session ends with no transcript", () => {
    const onFinalTranscript = vi.fn();
    hoisted.speech.listening = true;
    const { rerender } = render(
      <VoiceCapture label="Add details by speaking" onFinalTranscript={onFinalTranscript} />,
    );
    hoisted.speech.listening = false;
    rerender(
      <VoiceCapture label="Add details by speaking" onFinalTranscript={onFinalTranscript} />,
    );
    expect(onFinalTranscript).not.toHaveBeenCalled();
  });
});
