export type Sport = {
  key: string;
  name: string;
  icon: string; // MaterialCommunityIcons name
};

export const SPORTS: Sport[] = [
  { key: "soccer", name: "Soccer", icon: "soccer" },
  { key: "basketball", name: "Basketball", icon: "basketball" },
  { key: "videogames", name: "Sports Video Games", icon: "gamepad-variant" },
  { key: "hockey", name: "Hockey", icon: "hockey-sticks" },
  { key: "golf", name: "Golf", icon: "golf" },
  { key: "nfl", name: "NFL", icon: "football" },
  { key: "baseball", name: "Baseball", icon: "baseball" },
];

export const DIFFICULTIES = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
  { key: "deepcut", label: "DeepCut 💀" },
] as const;

// Shorter timer => higher points multiplier
export const TIMER_OPTIONS = [
  { key: "blitz", label: "10s", seconds: 10, mult: 1.5 },
  { key: "standard", label: "15s", seconds: 15, mult: 1 },
  { key: "chill", label: "20s", seconds: 20, mult: 0.75 },
] as const;

// Broader date range => higher points multiplier
export const ERA_OPTIONS = [
  { key: "modern", label: "Modern", hint: "Last 10 yrs", mult: 1 },
  { key: "2000s", label: "2000s+", hint: "Since 2000", mult: 1.25 },
  { key: "alltime", label: "All-Time", hint: "Any era", mult: 1.5 },
] as const;

export const timerOption = (key: string) =>
  TIMER_OPTIONS.find((t) => t.key === key) ?? TIMER_OPTIONS[1];

export const eraOption = (key: string) =>
  ERA_OPTIONS.find((e) => e.key === key) ?? ERA_OPTIONS[0];

export const sportName = (key: string) =>
  SPORTS.find((s) => s.key === key)?.name ?? key;

export const sportIcon = (key: string) =>
  SPORTS.find((s) => s.key === key)?.icon ?? "trophy";
