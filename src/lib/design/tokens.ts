// Canonical token tables for the luminous design system (light + dark).
// Source of truth for the AA contrast test and the globals.css variables.
// See DESIGN.md (the Luminous design system).

export type Hex = `#${string}`;

export interface ThemeTokens {
  ground: Hex;
  surface: Hex;
  surfaceRaised: Hex;
  hairline: Hex;
  ink: Hex;
  inkSoft: Hex;
  primary: Hex;
  primaryInk: Hex;
  primaryHover: Hex;
  contentSoft: Hex;
  contentMid: Hex;
  contentDeep: Hex;
  contentDeeper: Hex;
  spark: Hex;
  sparkInk: Hex;
  decor: Hex;
  error: Hex;
  errorSoft: Hex;
  errorDeep: Hex;
  warning: Hex;
  warningSoft: Hex;
  warningDeep: Hex;
  success: Hex;
  successSoft: Hex;
  successDeep: Hex;
  info: Hex;
  infoSoft: Hex;
  infoDeep: Hex;
  tierLove: Hex;
  tierLike: Hex;
  tierMaybe: Hex;
  tierOnward: Hex;
  // Per-tier text colour — varies because the value-ramp puts dark and light
  // chips in different places per theme.
  tierLoveInk: Hex;
  tierLikeInk: Hex;
  tierMaybeInk: Hex;
  tierOnwardInk: Hex;
}

export const light: ThemeTokens = {
  ground: "#D3E2E5",
  surface: "#E5EEF0",
  surfaceRaised: "#FFFFFF",
  hairline: "#C7DADE",
  ink: "#16242B",
  inkSoft: "#434F57",
  primary: "#004A67",
  primaryInk: "#FFFFFF",
  primaryHover: "#003E5B",
  contentSoft: "#D7DEE4",
  contentMid: "#B0BECA",
  contentDeep: "#4F7DA0",
  contentDeeper: "#4A5878",
  spark: "#EFCB77",
  sparkInk: "#1B1605",
  decor: "#B5AACC",
  error: "#9B4036",
  errorSoft: "#F3DEDA",
  errorDeep: "#7E2C24",
  warning: "#9C6B22",
  warningSoft: "#F4E6CC",
  warningDeep: "#6E4B16",
  success: "#3F5A34",
  successSoft: "#DCE7D9",
  successDeep: "#2C3F26",
  info: "#2E4769",
  infoSoft: "#D9E4EE",
  infoDeep: "#1F3350",
  tierLove: "#004A67",
  tierLike: "#2F6E8C",
  tierMaybe: "#6FA0B8",
  tierOnward: "#B8D4DC",
  tierLoveInk: "#FFFFFF",
  tierLikeInk: "#FFFFFF",
  tierMaybeInk: "#08222B",
  tierOnwardInk: "#16242B",
};

export const dark: ThemeTokens = {
  ground: "#001B21",
  surface: "#103F4A",
  surfaceRaised: "#123A4E",
  hairline: "#3F7FA0",
  ink: "#ECF2F4",
  inkSoft: "#B0C6CB",
  primary: "#4FB6C7",
  primaryInk: "#042026",
  primaryHover: "#6BC8D6",
  contentSoft: "#173F4D",
  contentMid: "#2D6377",
  contentDeep: "#234D66",
  contentDeeper: "#4A5C84",
  spark: "#EFCB77",
  sparkInk: "#1B1605",
  decor: "#6D5C9B",
  error: "#C98A82",
  errorSoft: "#4A241E",
  errorDeep: "#F3DEDA",
  warning: "#D4A24E",
  warningSoft: "#463411",
  warningDeep: "#F4E6CC",
  success: "#6E9E72",
  successSoft: "#25492F",
  successDeep: "#DCE7D9",
  info: "#7E97B8",
  infoSoft: "#21425A",
  infoDeep: "#D9E4EE",
  tierLove: "#BFE6EE",
  tierLike: "#79AFE0",
  tierMaybe: "#5E83A0",
  tierOnward: "#334654",
  tierLoveInk: "#08222B",
  tierLikeInk: "#08222B",
  tierMaybeInk: "#0A1622",
  tierOnwardInk: "#D6E2E6",
};
