// Quiet, visibly-secondary text link shared by the workspace and its previews.
// Touch target ≥44px (min-h-11). text-primary on bg-ground/bg-surface is an AA
// pairing already proven in contrast.test.ts. One definition, no drift.
export const quietLink =
  "inline-flex min-h-11 items-center rounded-control px-1 text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";
