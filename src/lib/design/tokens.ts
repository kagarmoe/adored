// Canonical token tables for the luminous design system (light + dark).
// Source of truth for the AA contrast test and the globals.css variables.
// See docs/plans/2026-06-09-luminous-design-system-design.md.

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
  accentAqua: Hex;
  accentSky: Hex;
  accentCornflower: Hex;
  accentPeriwinkle: Hex;
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
}

export const light: ThemeTokens = {
  ground: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  hairline: "#ECEFF1",
  ink: "#16242B",
  inkSoft: "#5B6B73",
  primary: "#004A67",
  primaryInk: "#FFFFFF",
  primaryHover: "#013A51",
  accentAqua: "#CAE4E1",
  accentSky: "#98CEDD",
  accentCornflower: "#79AFE0",
  accentPeriwinkle: "#B3BFD8",
  spark: "#C9BF29",
  sparkInk: "#2A2705",
  decor: "#D9C7D1",
  error: "#B0463C",
  errorSoft: "#F4DAD6",
  errorDeep: "#8A3128",
  warning: "#C58A2E",
  warningSoft: "#F6E6CC",
  warningDeep: "#7E5616",
  success: "#5C7C57",
  successSoft: "#DCE7D9",
  successDeep: "#3C5238",
  info: "#3C7E96",
  infoSoft: "#D6E8EE",
  infoDeep: "#27576A",
  tierLove: "#004A67",
  tierLike: "#79AFE0",
  tierMaybe: "#98CEDD",
  tierOnward: "#CAE4E1",
};

export const dark: ThemeTokens = {
  ground: "#081016",
  surface: "#14202A",
  surfaceRaised: "#1B2A35",
  hairline: "#243640",
  ink: "#ECF2F4",
  inkSoft: "#9FB3BC",
  primary: "#79AFE0",
  primaryInk: "#081016",
  primaryHover: "#9AC2E8",
  accentAqua: "#CAE4E1",
  accentSky: "#98CEDD",
  accentCornflower: "#79AFE0",
  accentPeriwinkle: "#3A4A5E",
  spark: "#D7CD3A",
  sparkInk: "#081016",
  decor: "#5E4A55",
  error: "#E08A80",
  errorSoft: "#2A1714",
  errorDeep: "#F4DAD6",
  warning: "#E0B266",
  warningSoft: "#241B0E",
  warningDeep: "#F6E6CC",
  success: "#8FB089",
  successSoft: "#152017",
  successDeep: "#DCE7D9",
  info: "#79B6CC",
  infoSoft: "#101F25",
  infoDeep: "#D6E8EE",
  tierLove: "#BFE6EE",
  tierLike: "#79AFE0",
  tierMaybe: "#5E83A0",
  tierOnward: "#334654",
};
