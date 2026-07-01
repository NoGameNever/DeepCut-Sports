export type Sport = {
  key: string;
  name: string;
  icon: string; // MaterialCommunityIcons name
};

export const SPORTS: Sport[] = [
  { key: "soccer", name: "Soccer", icon: "soccer" },
  { key: "basketball", name: "Basketball", icon: "basketball" },
  { key: "cricket", name: "Cricket", icon: "cricket" },
  { key: "tennis", name: "Tennis", icon: "tennis" },
  { key: "f1", name: "Formula 1", icon: "racing-helmet" },
  { key: "nfl", name: "NFL", icon: "football" },
  { key: "baseball", name: "Baseball", icon: "baseball" },
];

export const DIFFICULTIES = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
] as const;

export const sportName = (key: string) =>
  SPORTS.find((s) => s.key === key)?.name ?? key;

export const sportIcon = (key: string) =>
  SPORTS.find((s) => s.key === key)?.icon ?? "trophy";
