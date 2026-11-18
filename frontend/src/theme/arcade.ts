export const arcadeColors = {
  ink: "#0A0A0A",
  panel: "#14141B",
  gold: "#FFC107",
  pink: "#FF0E6A",
  cyan: "#00BBFF",
  correct: "#58E68F",
  incorrect: "#FF8293",
};

const sports: Record<string, number | undefined> = {
  basketball: require("../../assets/arcade/basketball.webp"),
  nfl: require("../../assets/arcade/football.webp"),
  soccer: require("../../assets/arcade/soccer.webp"),
  hockey: require("../../assets/arcade/hockey.webp"),
  golf: require("../../assets/arcade/golf.webp"),
  videogames: require("../../assets/arcade/sports-gaming.webp"),
};

export const arcadeArt = {
  setup: require("../../assets/arcade/setup.webp"),
  gameplay: require("../../assets/arcade/gameplay.webp"),
  sports,
};
