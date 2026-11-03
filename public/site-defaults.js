export const DAILY_CREDITS = 300;
export const MAX_PINNED_ANIME = 20;
export const MAX_SPOTLIGHTS = 20;
export const PICKEM_WINNER_REWARD = 1000;
export const PICKEM_WINDOW = 15 * 60 * 1000;
export const PICKEM_REOPEN_WINDOW = 5 * 60 * 1000;
export const TOUR_REWARDS = Object.freeze({
  participation: 1000,
  counting: 500,
  reporting: 500,
});
export const defaultReward = (category, games = 1) =>
  ["reporting", "counting"].includes(category)
    ? TOUR_REWARDS[category] * games
    : TOUR_REWARDS[category];
