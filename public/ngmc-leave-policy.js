export const RANKED_LEAVE_COST = 25;
export const RECONNECT_MS = 2 * 60_000;
export function activeRankedGame(match, now) {
  if (match?.format !== 'ngmc-ranked') return false;
  if (['loading', 'cancelled', 'finished'].includes(match.phase)) return false;
  if (match.phase === 'reveal' && (match.index === 34 || match.teams.includes(0))) return false;
  return match.phase !== 'guess' || match.index > 0 || now >= match.startsAt;
}
export const leaveWarning = `Leave this ranked match? You will lose ${RANKED_LEAVE_COST} Rating. Three leaves within 14 days trigger a 72-hour NGMC Ranked ban.`;
