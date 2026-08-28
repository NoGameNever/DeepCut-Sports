export type Opt = { key: string; label: string; soon?: boolean; hint?: string; icon?: string };

export const GAME_TYPES: Opt[] = [
  { key: "classic", label: "Classic", hint: "Standard Q&A" },
  { key: "lightning", label: "Lightning", hint: "10s rounds + speed scoring" },
  { key: "streak", label: "Streak", hint: "Combo scoring locked on" },
  { key: "deepcut", label: "Deep Cut", hint: "DeepCut difficulty locked" },
  { key: "survival", label: "Survival", soon: true },
  { key: "wager", label: "Wager", soon: true },
  { key: "team", label: "Team 2v2", soon: true },
];

export const DIFFICULTIES: Opt[] = [
  { key: "casual", label: "Casual" },
  { key: "normal", label: "Normal" },
  { key: "hard", label: "Hard" },
  { key: "expert", label: "Expert" },
  { key: "deepcut", label: "Deep Cut" },
  { key: "mixed", label: "Mixed" },
  { key: "adaptive", label: "Adaptive", soon: true },
];

export const CATEGORIES: Opt[] = [
  { key: "nba", label: "NBA", icon: "basketball" },
  { key: "nfl", label: "NFL", icon: "football" },
  { key: "mlb", label: "MLB", icon: "baseball" },
  { key: "nhl", label: "NHL", icon: "hockey-puck" },
  { key: "soccer", label: "Soccer", icon: "soccer" },
  { key: "golf", label: "Men's PGA", icon: "golf" },
  { key: "videogames", label: "Sports Games", icon: "gamepad-variant" },
  { key: "general", label: "General", icon: "trophy" },
];

export const ERAS: Opt[] = [
  { key: "all", label: "All Eras" },
  { key: "current", label: "Current" },
  { key: "2020s", label: "2020s" },
  { key: "2010s", label: "2010s" },
  { key: "2000s", label: "2000s" },
  { key: "1990s", label: "1990s" },
  { key: "pre1990", label: "Pre-1990" },
];

export const ANSWER_FORMATS: Opt[] = [
  { key: "multiple_choice", label: "Multiple Choice" },
  { key: "true_false", label: "True / False", soon: true },
  { key: "mixed", label: "Mixed", soon: true },
  { key: "type_in", label: "Type-In", soon: true },
];

export const TIMERS: Opt[] = [
  { key: "0", label: "No Timer" },
  { key: "10", label: "10s" },
  { key: "15", label: "15s" },
  { key: "30", label: "30s" },
  { key: "45", label: "45s" },
];

export const QUESTION_PRESETS: Opt[] = [
  { key: "5", label: "Quick · 5" },
  { key: "10", label: "Standard · 10" },
  { key: "20", label: "Long · 20" },
];

export const DEFAULT_SETTINGS = {
  game_type: "classic",
  question_count: 10,
  difficulty: "normal",
  selected_categories: ["general"],
  selected_subcategories: [],
  era_filter: "all",
  answer_format: "multiple_choice",
  timer_seconds: 15,
  speed_bonus_enabled: true,
  streak_bonus_enabled: true,
  wrong_answer_penalty_enabled: false,
  final_question_multiplier_enabled: false,
  max_players: 4,
  friends_only: false,
  invite_only: true,
  allow_rematch: true,
  allow_spectators: false,
  settings_locked: false,
};

const labelFor = (opts: Opt[], key: string) => opts.find((o) => o.key === key)?.label ?? key;

export const catLabel = (key: string) => labelFor(CATEGORIES, key);
export const catIcon = (key: string) => CATEGORIES.find((c) => c.key === key)?.icon ?? "trophy";
export const gameTypeLabel = (key: string) => labelFor(GAME_TYPES, key);
export const difficultyLabel = (key: string) => labelFor(DIFFICULTIES, key);
export const eraLabel = (key: string) => labelFor(ERAS, key);
export const formatLabel = (key: string) => labelFor(ANSWER_FORMATS, key);
export const timerLabel = (secs: number) => (secs === 0 ? "No Timer" : `${secs}s`);

export const summarize = (s: any) => {
  if (!s) return [];
  return [
    { icon: "gamepad-variant", label: "Mode", value: gameTypeLabel(s.game_type) },
    { icon: "help-circle", label: "Questions", value: String(s.question_count) },
    { icon: "speedometer", label: "Difficulty", value: difficultyLabel(s.difficulty) },
    { icon: "shape", label: "Categories", value: (s.selected_categories || []).map(catLabel).join(", ") },
    { icon: "calendar-range", label: "Era", value: eraLabel(s.era_filter) },
    { icon: "timer-outline", label: "Timer", value: timerLabel(s.timer_seconds) },
    { icon: "format-list-checks", label: "Format", value: formatLabel(s.answer_format) },
  ];
};
