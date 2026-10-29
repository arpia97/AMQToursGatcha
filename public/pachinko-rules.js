export const ROULETTE_DURATION = 4600;
export const ROULETTE_POCKETS = Array.from({ length: 37 }, (_, i) =>
  i === 0 ? "green" : i % 2 ? "red" : "black",
);
export const ROULETTE_RETURNS = { red: 2, black: 2, green: 35 };
export const CLIMB_ENTRY = 500;
export const CLIMB_CHOICES = 10;
export const CLIMB_PER_HEIGHT = 18;
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
].map(([min, max], id) => ({ id, min, max }));
export function climbOffers(rand) {
  const pool = CLIMB_OPTIONS.map((o) => o.id),
    result = [];
  for (let i = 0; i < 3; i++) result.push(pool.splice(rand(pool.length), 1)[0]);
  return result;
}
export const climbHeight = (height, delta) => Math.max(0, height + delta);
export const climbPayout = (height) => height * CLIMB_PER_HEIGHT;
export const signedHeight = (n) =>
  n > 0 ? "+" + n : String(n).replace("-", "−");
export function climbOptionLabel(id) {
  const o = CLIMB_OPTIONS[id];
  return o.min === o.max
    ? signedHeight(o.min)
    : signedHeight(o.min) + " to " + signedHeight(o.max);
}
