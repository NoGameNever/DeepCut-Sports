// Display metadata for the progression system (state comes from the backend).
export const RARITY_COLORS: Record<string, string> = {
  common: "#9BA1A6",
  rare: "#00B8FF",
  epic: "#6A00FF",
  legendary: "#FFC107",
  mythic: "#FF0EA9",
};

export const TIER_COLORS: Record<string, string> = {
  casual: "#4CD964",
  ball_watcher: "#00B8FF",
  ball_knower: "#B36BFF",
  film_grinder: "#FF9F0A",
  elite_ball_knower: "#FF3B30",
  hall_of_ball: "#FFC107",
  goat_status: "#7FDBFF",
};

export const tierColor = (key?: string) => TIER_COLORS[key || "casual"] ?? TIER_COLORS.casual;
export const rarityColor = (r?: string) => RARITY_COLORS[r || "common"] ?? RARITY_COLORS.common;
