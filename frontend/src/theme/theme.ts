export const colors = {
  surface: "#1A1A1A",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#262026",
  onSurfaceSecondary: "#C4BBC2",
  surfaceTertiary: "#363036",
  onSurfaceTertiary: "#8F8590",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0A0A0A",
  brand: "#FF0EA9",
  brandPrimary: "#FF0EA9",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#00B8FF",
  onBrandSecondary: "#04121D",
  brandTertiary: "#3A0A28",
  onBrandTertiary: "#FF6FC7",
  gold: "#FFC107",
  purple: "#9B5DE5",
  cyan: "#00B8FF",
  success: "#06D6A0",
  onSuccess: "#00291D",
  warning: "#FF9F1C",
  onWarning: "#2E2400",
  error: "#EF476F",
  onError: "#FFFFFF",
  ink: "#000000", // thick sticker outlines + hard offset shadows
  border: "#3A333A",
  borderStrong: "#000000",
  divider: "#241E24",
};

// Vivid flat sticker fills — cycle through for tiles, answers, badges (never gradients)
export const stickerFills = ["#FF9F1C", "#2EC4B6", "#9B5DE5", "#06D6A0", "#00B8FF", "#EF476F", "#FFD166", "#FF0EA9"];

// rgba tints for answer states
export const tints = {
  correct: "rgba(6,214,160,0.18)",
  wrong: "rgba(239,71,111,0.18)",
  blue: "rgba(0,184,255,0.15)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
};

export const fonts = {
  logo: "PermanentMarker-Regular", // DeepCut brush wordmark / brand headers
  poster: "RubikSprayPaint-Regular", // spray-paint tag headers / section titles
  display: "BarlowCondensed-SemiBold",
  displayBold: "BarlowCondensed-Bold", // numbers, scores, timers
  body: "System",
  bodyMedium: "System",
  bodySemiBold: "System",
  cartoon: "Bangers-Regular", // chunky comic lettering for sticker-style menu buttons
};

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
};
