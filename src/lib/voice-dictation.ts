// Story-field dictation helpers. Speaking into the story appends verbatim; the
// story has a fixed cap, so dictation clamps in code (the textarea's own maxLength
// only guards typing). Kept pure and framework-free so the boundary is easy to test.

/** Total characters the story field holds — mirrors the textarea's maxLength. */
export const STORY_MAX_LENGTH = 2000;

/** Shown + announced when dictation fills the story to its limit (the person's side). */
export const STORY_LIMIT_MESSAGE =
  "That's all the room this story needs for now.";

export interface StoryDictationResult {
  /** The story text after appending, never longer than the limit. */
  text: string;
  /** True when the cap trimmed the transcript — the caller surfaces the limit copy. */
  clamped: boolean;
}

// Append a spoken transcript to the existing story verbatim, joined by a single
// separating space (none when the story is empty), then clamp to `max` characters.
export function appendStoryDictation(
  existing: string,
  transcript: string,
  max: number = STORY_MAX_LENGTH,
): StoryDictationResult {
  if (transcript.length === 0) return { text: existing, clamped: false };

  const separator = existing.length > 0 ? " " : "";
  const combined = existing + separator + transcript;

  if (combined.length <= max) return { text: combined, clamped: false };
  return { text: combined.slice(0, max), clamped: true };
}
