export const BETA_MODE = String(process.env.EXPO_PUBLIC_BETA_MODE || "").toLowerCase() === "true";
export const BETA_VERSION = process.env.EXPO_PUBLIC_BETA_VERSION || "Closed Alpha 1";
export const BETA_QUESTION_COUNT = 7;
export const BETA_DIFFICULTY = "mixed";
export const BETA_TIMER = "standard";
export const BETA_ERA = "alltime";
