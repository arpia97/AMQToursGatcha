export const TOUR_REWARD_VERSION = 2;
export const STAFF_REWARD = 750;
export const TOUR_SIZES = [8, 16, 24, 32];
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const whole = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw invalid(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
};
export function participationRate(size) {
  whole(size, 1, 32, "Tour size");
  if (size <= 16) return 200;
  if (size === 24) return 300;
  if (size === 32) return 400;
  throw invalid("Choose a tour size of 16 or fewer, 24, or 32 players.");
}
export function tourRewardDefaults(count) {
  whole(count, 1, 32, "Pasted player count");
  const tourSize = TOUR_SIZES.find((size) => size >= count);
  return { tourSize, maxRounds: tourSize === 8 ? 3 : tourSize === 16 ? 6 : 5 };
}
export function initialTourRewards(
  players,
  settings = tourRewardDefaults(players.length),
) {
  return {
    rewardVersion: TOUR_REWARD_VERSION,
    tourSize: settings.tourSize,
    maxRounds: settings.maxRounds,
    participants: players.map((p) => ({
      player: p.id,
      rounds: settings.maxRounds,
      count: false,
      report: false,
    })),
  };
}
// Shared preview math; the server revalidates identities and calculates every amount again.
export function tourRewardQuote(players, plan) {
  if (plan.rewardVersion !== TOUR_REWARD_VERSION)
    throw invalid(
      "Tour reward rules changed. Refresh the host console and review the tour again.",
    );
  const size = whole(plan.tourSize, 1, 32, "Tour size"),
    rate = participationRate(size),
    maxRounds = whole(plan.maxRounds, 1, 2000, "Maximum rounds");
  const originals = new Set(players.map((p) => p.id));
  if (originals.size > size)
    throw invalid("The pasted roster exceeds the selected tour size.");
  if (
    !Array.isArray(plan.participants) ||
    plan.participants.length < originals.size ||
    plan.participants.length > 500
  )
    throw invalid("Review the players, substitutes and staff before awarding.");
  const seen = new Set(),
    totals = new Map();
  const rows = plan.participants.map((row) => {
    if (
      !row ||
      typeof row.player !== "string" ||
      !row.player ||
      seen.has(row.player)
    )
      throw invalid("Each player may appear only once in a tour reward batch.");
    seen.add(row.player);
    const rounds = whole(row.rounds, 0, maxRounds, "Rounds played");
    if (typeof row.count !== "boolean" || typeof row.report !== "boolean")
      throw invalid("Review the Count and Report checkboxes for every player.");
    const staffOnly = row.staffOnly === true,
      replaces = row.replaces || null;
    if (originals.has(row.player)) {
      if (staffOnly || replaces)
        throw invalid(
          "Pasted players cannot also be substitutes or outside staff.",
        );
    } else if (staffOnly) {
      if (rounds || replaces || (!row.count && !row.report))
        throw invalid(
          "Outside staff must have zero played rounds and Count or Report selected.",
        );
    } else if (!originals.has(replaces)) {
      throw invalid("Choose which pasted player the substitute replaces.");
    }
    if (!staffOnly) {
      const root = replaces || row.player;
      totals.set(root, (totals.get(root) || 0) + rounds);
      if (totals.get(root) > maxRounds)
        throw invalid(
          "A player and their substitutes cannot exceed the tour’s maximum rounds together.",
        );
    }
    const participation = rounds * rate,
      counting = row.count ? STAFF_REWARD : 0,
      reporting = row.report ? STAFF_REWARD : 0;
    return {
      player: row.player,
      rounds,
      replaces,
      staffOnly,
      count: row.count,
      report: row.report,
      participation,
      counting,
      reporting,
      total: participation + counting + reporting,
    };
  });
  if ([...originals].some((id) => !seen.has(id)))
    throw invalid("The pasted participants changed. Review the batch again.");
  const participation = rows.reduce((sum, row) => sum + row.participation, 0),
    staff = rows.reduce((sum, row) => sum + row.counting + row.reporting, 0);
  if (!participation && !staff)
    throw invalid("Choose at least one round or staff reward.");
  return {
    tourSize: size,
    maxRounds,
    rate,
    rows,
    participation,
    staff,
    total: participation + staff,
  };
}
