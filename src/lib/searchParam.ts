// A ?q= value as the lists use it: a repeated key arrives as string[] and is ignored;
// whitespace-only is no query; capped at the inputs' maxLength.
export const queryFrom = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 100) : "");
