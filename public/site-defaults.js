export const DAILY_CREDITS = 300;
export const MAX_PINNED_ANIME = 20;
export const FREE_SPOTLIGHTS = 30;
export const MAX_SPOTLIGHTS = 100;
export const MAX_WISHLIST = 1000;
export const PICKEM_WINNER_REWARD = 1000;
// Tour winner entries contain four-player teams; round up partial eight-player groups.
export const tourWinnerRewardDefault = (teamCount = 4) =>
  Math.ceil(teamCount / 2) * 500;
export const PICKEM_WINDOW = 15 * 60 * 1000;
export const PICKEM_REOPEN_WINDOW = 5 * 60 * 1000;
import { participationRate, STAFF_REWARD } from "./tour-rewards.js";
export const TOUR_REWARDS = Object.freeze({
  participation: 200,
  counting: STAFF_REWARD,
  reporting: STAFF_REWARD,
});
export const defaultReward = (category, rounds = 1, tourSize = 16) =>
  category === "participation"
    ? participationRate(tourSize) * rounds
    : TOUR_REWARDS[category];
