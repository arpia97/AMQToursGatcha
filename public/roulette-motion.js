export const ROULETTE_MOTION_KEY = "amqtours-roulette-motion";
export const ROULETTE_MOTION_MODES = ["full", "system", "reduced"];
export function readRouletteMotion(storage) {
  try {
    const saved = storage.getItem(ROULETTE_MOTION_KEY);
    if (ROULETTE_MOTION_MODES.includes(saved)) return saved;
  } catch {}
  return "full";
}
export function saveRouletteMotion(mode, storage) {
  if (!ROULETTE_MOTION_MODES.includes(mode)) return false;
  try {
    storage.setItem(ROULETTE_MOTION_KEY, mode);
  } catch {}
  return true;
}
// Pockets are drawn clockwise from twelve o'clock. Align the chosen centre
// under the stationary pointer after five to six turns, independent of colour.
export const rouletteStopAngle = (pocket) => 2160 - ((pocket + 0.5) * 360) / 37;
