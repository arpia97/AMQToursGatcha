export const ROULETTE_DURATION = 4600;
export const ROULETTE_POCKETS = Array.from({ length: 37 }, (_, i) =>
  i === 0 ? "green" : i % 2 ? "red" : "black",
);
export const ROULETTE_RETURNS = { red: 2, black: 2, green: 35 };
export const CLIMB_ENTRY = 500;
export const CLIMB_CHOICES = 10;
export const CLIMB_PER_HEIGHT = 18;
export const CLIMB_METRES_PER_STEP = 10;
export const CLIMB_OPTIONS = [
  [1, 1],
  [2, 2],
  [3, 3],
  [5, 5],
  [1, 6],
  [-1, 1],
  [-1, 2],
  [-1, 3],
  [-2, 3],
  [-2, 4],
  [-2, 5],
  [-3, 3],
  [-3, 4],
  [-3, 5],
  [-5, 10],
  [-5, 5],
  [-10, 10],
  [-7, 7],
].map(([min, max], id) => ({
  id,
  min: min * CLIMB_METRES_PER_STEP,
  max: max * CLIMB_METRES_PER_STEP,
}));
export function climbOffers(rand) {
  const pool = CLIMB_OPTIONS.map((o) => o.id),
    result = [];
  for (let i = 0; i < 3; i++) result.push(pool.splice(rand(pool.length), 1)[0]);
  return result;
}
export const climbHeight = (height, delta) => Math.max(0, height + delta);
export const climbPayout = (height) =>
  Math.floor((height * CLIMB_PER_HEIGHT) / CLIMB_METRES_PER_STEP);
export const signedHeight = (n) =>
  n > 0 ? "+" + n : String(n).replace("-", "−");
export const climbDistance = (height) => height.toLocaleString("en-US") + " m";
export const climbChange = (delta) => signedHeight(delta) + " m";
export function climbOptionLabel(id) {
  const o = CLIMB_OPTIONS[id];
  return o.min === o.max
    ? climbChange(o.min)
    : signedHeight(o.min) + " to " + climbChange(o.max);
}
// Existing games used 10-metre steps. Convert their geometry once on read;
// keep their charged entry, paid returns, turn count and revision unchanged.
export function climbInMetres(game) {
  if (!game || game.distanceUnit === "m") return game;
  const move = (m) =>
    m && { ...m, delta: m.delta * 10, from: m.from * 10, to: m.to * 10 };
  return {
    ...game,
    distanceUnit: "m",
    height: game.height * 10,
    moves: game.moves.map(move),
    last: move(game.last),
  };
}
