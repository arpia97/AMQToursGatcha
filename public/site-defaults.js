export const DAILY_CREDITS = 300;
export const MAX_PINNED_ANIME = 20;
export const MAX_SPOTLIGHTS = 20;
export const PICKEM_WINDOW = 10 * 60 * 1000;
export const TOUR_REWARDS = Object.freeze({
  participation: 1000,
  counting: 2000,
  reporting: 500,
});
export const defaultReward = (category, games = 1) =>
  category === "reporting"
    ? TOUR_REWARDS.reporting * games
    : TOUR_REWARDS[category];
